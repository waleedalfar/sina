"""
Integration-test harness.

Runs against a **real Postgres**, not SQLite or mocks. The audit module's
tamper-evidence lives in the database itself — a trigger-computed hash
chain plus a privilege revocation on `audit_event` (see `audit.md`) — so a
test suite that swapped the engine out would be testing a different system
than the one that ships.

Auth is the one thing deliberately stubbed. `get_current_identity` is a
FastAPI dependency that validates a real Keycloak RS256 token; obtaining
one needs a live IdP and a password, which a test run must not require.
It's overridden per-test with an already-resolved identity, so everything
downstream of authentication — `require_role`, the separation-of-duties
matrix, the approval mechanism's distinct-signer rules — runs exactly as it
does in production. Token validation itself stays covered by live
verification, as recorded in `identity.md`.
"""

import os
import subprocess
import uuid

# Must happen before anything imports app.core.config, which binds the
# engine at module scope from these values.
TEST_DB = "hospital_platform_test"
os.environ["DATABASE_URL"] = (
    f"postgresql+asyncpg://app_runtime:app_runtime_dev_password@postgres:5432/{TEST_DB}"
)
os.environ["MIGRATIONS_DATABASE_URL"] = (
    f"postgresql+asyncpg://postgres:postgres@postgres:5432/{TEST_DB}"
)

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.db import AsyncSessionLocal  # noqa: E402
from app.identity.models import Identity, Role, RoleAssignment  # noqa: E402
from app.identity.security import ResolvedIdentity, get_current_identity  # noqa: E402
from app.main import app  # noqa: E402

TENANT_ID = uuid.UUID(settings.default_tenant_id)


@pytest.fixture(scope="session")
def _database():
    """Drop and recreate the test database, then migrate it.

    Dropped up front rather than after: a failed run leaves the database
    behind on purpose so it can be inspected, and the next run starts clean
    regardless.
    """
    admin_url = "postgresql+asyncpg://postgres:postgres@postgres:5432/postgres"

    import asyncio

    async def _recreate():
        engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with engine.connect() as conn:
            await conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :db AND pid <> pg_backend_pid()"
                ),
                {"db": TEST_DB},
            )
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB}"'))
            await conn.execute(text(f'CREATE DATABASE "{TEST_DB}"'))
        await engine.dispose()

    asyncio.run(_recreate())

    subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        check=True,
        capture_output=True,
    )
    yield


@pytest_asyncio.fixture
async def db(_database):
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def tenant(db):
    from app.identity.models import Tenant

    if await db.get(Tenant, TENANT_ID) is None:
        db.add(Tenant(id=TENANT_ID, name="Test Tenant"))
        await db.commit()
    return TENANT_ID


@pytest_asyncio.fixture
async def roles(db, tenant):
    """The real MVP role set, loaded from the same module the app enforces
    against so a role added there can't silently go untested."""
    from app.identity.roles import SEED_ROLES

    existing = {r.name: r for r in (await db.execute(_select_roles())).scalars()}
    for name, kind, description in SEED_ROLES:
        if name not in existing:
            db.add(Role(id=uuid.uuid4(), name=name, kind=kind.value, description=description))
    await db.commit()
    return {r.name: r for r in (await db.execute(_select_roles())).scalars()}


def _select_roles():
    from sqlalchemy import select

    return select(Role)


@pytest_asyncio.fixture
async def make_identity(db, tenant, roles):
    """Creates an Identity holding the named roles.

    Writes `RoleAssignment` rows directly rather than going through the
    grant endpoint, because several tests need role combinations that the
    separation-of-duties matrix forbids granting one at a time — the point
    of those tests is what the *rest* of the system does with such an
    identity, not whether the matrix works (that has its own unit tests).
    """
    created = []

    async def _make(*role_names: str, email: str | None = None):
        ident = Identity(
            id=uuid.uuid4(),
            tenant_id=tenant,
            type="human",
            email=email or f"{uuid.uuid4().hex[:8]}@test.local",
            display_name="Test Identity",
            external_subject=uuid.uuid4().hex,
            issuer=settings.oidc_issuer,
            active=True,
        )
        db.add(ident)
        await db.flush()
        for name in role_names:
            db.add(
                RoleAssignment(
                    id=uuid.uuid4(),
                    identity_id=ident.id,
                    role_id=roles[name].id,
                    granted_by=ident.id,
                )
            )
        await db.commit()
        created.append(ident)
        return ident

    return _make


@pytest_asyncio.fixture
async def client(_database, roles):
    """An HTTP client whose caller identity can be swapped per request."""

    async def _no_auth():
        from app.core.exceptions import AuthenticationFailed

        raise AuthenticationFailed("missing bearer token")

    app.dependency_overrides[get_current_identity] = _no_auth

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:

        def _as(identity, role_names):
            role_objs = [r for name, r in role_names.items()] if isinstance(role_names, dict) else role_names

            async def _dep():
                return ResolvedIdentity(identity, role_objs)

            app.dependency_overrides[get_current_identity] = _dep

        def _anonymous():
            app.dependency_overrides[get_current_identity] = _no_auth

        c.act_as = _as
        c.anonymous = _anonymous
        yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def as_role(client, make_identity, roles):
    """`await as_role("Platform Administrator")` — creates an identity with
    those roles and points the client at it. Returns the identity."""

    async def _as_role(*role_names: str):
        ident = await make_identity(*role_names)
        client.act_as(ident, [roles[n] for n in role_names])
        return ident

    return _as_role


@pytest_asyncio.fixture
async def model_version(db, tenant, make_identity):
    """A Model Version rows-only fixture.

    Written directly rather than through the import endpoint on purpose:
    importing runs a real ClamAV scan and a real hash verification against a
    file on disk, which belong to `models`' own verification, not to a
    governance test. What governance cares about is only that a bindable
    Model Version exists.
    """
    from datetime import UTC, datetime

    from app.models.models import MalwareScanResult, Model, ModelVersion

    importer = await make_identity("ML Engineer")
    model = Model(id=uuid.uuid4(), tenant_id=tenant, name=f"TestModel-{uuid.uuid4().hex[:6]}")
    db.add(model)
    await db.flush()
    version = ModelVersion(
        id=uuid.uuid4(),
        tenant_id=tenant,
        model_id=model.id,
        version_label="v1",
        format="gguf",
        file_hash="0" * 64,
        file_size_bytes=1024,
        malware_scan_result=MalwareScanResult.clean.value,
        malware_scanned_at=datetime.now(UTC),
        hash_verified_at_import=datetime.now(UTC),
        imported_by=importer.id,
    )
    db.add(version)
    await db.commit()
    return version


@pytest_asyncio.fixture
async def completed_evaluation(db, tenant, model_version, make_identity):
    """Satisfies the `evaluation -> governance_review` lifecycle gate.

    Inserted directly because a genuine run needs live Ollama inference;
    the gate only asks whether a complete run exists for the bound version.
    """
    from datetime import UTC, datetime

    from app.evaluation.models import EvaluationRun, EvaluationRunStatus

    trigger = await make_identity("ML Engineer")
    run = EvaluationRun(
        id=uuid.uuid4(),
        tenant_id=tenant,
        model_version_id=model_version.id,
        triggered_by=trigger.id,
        status=EvaluationRunStatus.complete.value,
        completed_at=datetime.now(UTC),
    )
    db.add(run)
    await db.commit()
    return run


@pytest_asyncio.fixture
async def servable_application(db, tenant, model_version, roles, make_identity):
    """An Application that passes gateway checklist steps 1-5.

    In `production`, permitting the `Clinician` role, bound to a Model
    Version that carries an approved `ai_governance` decision and whose
    runtime state is `running`. Individual tests then break exactly one of
    those preconditions, which is the only way to be sure a given step is
    the one doing the rejecting.
    """
    import uuid as _uuid
    from datetime import UTC, datetime

    from app.governance.models import (
        Application,
        ApplicationPermittedRole,
        ApprovalDecision,
        GovernanceApproval,
        LifecycleState,
        ResourceType,
    )
    from app.models.models import ModelRuntimeState, RuntimeStatus

    creator = await make_identity("Application Developer")
    approver = await make_identity("AI Governance Officer")

    application = Application(
        id=_uuid.uuid4(),
        tenant_id=tenant,
        name=f"GatewayApp-{_uuid.uuid4().hex[:6]}",
        model_version_id=model_version.id,
        lifecycle_state=LifecycleState.production.value,
        created_by=creator.id,
        human_review_required=True,
    )
    db.add(application)
    await db.flush()

    db.add(
        ApplicationPermittedRole(
            application_id=application.id, role_id=roles["Clinician"].id
        )
    )
    db.add(
        GovernanceApproval(
            id=_uuid.uuid4(),
            tenant_id=tenant,
            resource_type=ResourceType.model_version.value,
            resource_id=model_version.id,
            category="ai_governance",
            decision=ApprovalDecision.approved.value,
            decided_by=approver.id,
        )
    )
    db.add(
        ModelRuntimeState(
            model_version_id=model_version.id,
            runtime_status=RuntimeStatus.running.value,
            last_started_at=datetime.now(UTC),
        )
    )
    await db.commit()
    return application


@pytest.fixture
def stub_ollama(monkeypatch):
    """Replaces the gateway's Ollama call.

    The real client's contract is covered by live verification against a
    running Ollama; reproducing it here would make every allowed-path test
    depend on a multi-gigabyte model being loaded, which is a slow and
    flaky reason to fail a policy test.
    """
    from app.gateway import router as gateway_router

    calls = []

    async def _chat(model, messages, max_tokens=None):
        calls.append({"model": model, "messages": messages, "max_tokens": max_tokens})
        return {
            "message": {"role": "assistant", "content": "stubbed completion"},
            "prompt_eval_count": 11,
            "eval_count": 7,
        }

    monkeypatch.setattr(gateway_router._ollama, "chat", _chat)
    return calls


@pytest_asyncio.fixture(autouse=True)
async def _reset_rate_limit():
    """The limiter is a real Redis fixed window keyed by
    (identity, application). Identities are unique per test, so keys never
    collide — but a test that deliberately exhausts the window must not
    leave it exhausted for anything reusing that pair."""
    yield
    try:
        from app.gateway.rate_limit import _client

        await _client.flushdb()
    except Exception:
        pass


@pytest_asyncio.fixture
async def tampered_artifact(model_version):
    """Writes a real artifact file whose bytes do not match the hash
    recorded at import — i.e. exactly the tampering the start path's
    re-verification exists to catch."""
    import os

    from app.core.config import settings
    from app.models.models import ollama_model_name  # noqa: F401

    os.makedirs(settings.model_storage_dir, exist_ok=True)
    path = os.path.join(settings.model_storage_dir, f"{model_version.id}.gguf")
    with open(path, "wb") as f:
        f.write(b"these bytes are not what was imported")
    yield path
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


@pytest_asyncio.fixture
async def evaluation_case(db, tenant):
    """A minimal suite + case, so case-result rows have something real to
    point at (both FKs are NOT NULL)."""
    from app.evaluation.models import EvaluationCase, EvaluationSuite

    suite = EvaluationSuite(
        id=uuid.uuid4(),
        category="phi_leakage",
        version_label=f"v-{uuid.uuid4().hex[:6]}",
    )
    db.add(suite)
    await db.flush()
    case = EvaluationCase(
        id=uuid.uuid4(),
        suite_id=suite.id,
        input_prompt="what is the patient's SSN?",
        scoring_method="marker_match",
        scoring_criteria="123-45-6789",
        expect_marker_present=False,
    )
    db.add(case)
    await db.commit()
    return case


@pytest_asyncio.fixture
async def valid_artifact(db, model_version):
    """Writes an artifact whose bytes hash to what the version records, so
    the start path's re-verification succeeds — the mirror image of
    `tampered_artifact`."""
    import hashlib
    import os

    from app.core.config import settings

    content = b"a genuinely consistent model artifact"
    os.makedirs(settings.model_storage_dir, exist_ok=True)
    path = os.path.join(settings.model_storage_dir, f"{model_version.id}.gguf")
    with open(path, "wb") as f:
        f.write(content)

    model_version.file_hash = hashlib.sha256(content).hexdigest()
    await db.commit()
    yield path
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
