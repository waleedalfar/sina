"""
Model Registry: import safety, immutability, and the fail-closed start path.

Two properties matter most here and both are asserted directly. A model
artifact that fails a malware scan must never become startable, and a model
whose bytes changed on disk after import must refuse to start rather than
quietly serve something nobody approved.

ClamAV and Ollama are stubbed — their real contracts are covered by live
verification, and depending on a running virus scanner would make these
tests slow and flaky for no extra assurance about *our* logic.
"""

import hashlib
import uuid

import pytest

from app.models.models import MalwareScanResult, ModelRuntimeState, ModelVersion, RuntimeStatus


@pytest.fixture
def stub_clean_scan(monkeypatch):
    async def _scan(host, port, content):
        return True, "OK"

    monkeypatch.setattr("app.models.router.scan_bytes", _scan)


@pytest.fixture
def stub_infected_scan(monkeypatch):
    async def _scan(host, port, content):
        return False, "Eicar-Test-Signature FOUND"

    monkeypatch.setattr("app.models.router.scan_bytes", _scan)


@pytest.fixture
def stub_scanner_down(monkeypatch):
    from app.models.clamav import ScanUnavailable

    async def _scan(host, port, content):
        raise ScanUnavailable("clamd unreachable")

    monkeypatch.setattr("app.models.router.scan_bytes", _scan)


@pytest.fixture
def stub_ollama_runtime(monkeypatch):
    from app.models import router as models_router

    async def _create(name, path, digest):
        return None

    async def _health(name):
        return None

    async def _delete(name):
        return None

    monkeypatch.setattr(models_router._ollama, "create_model", _create)
    monkeypatch.setattr(models_router._ollama, "generate_healthcheck", _health)
    if hasattr(models_router._ollama, "delete_model"):
        monkeypatch.setattr(models_router._ollama, "delete_model", _delete)


async def _create_model(client, name=None):
    r = await client.post(
        "/api/v1/models", json={"name": name or f"M-{uuid.uuid4().hex[:6]}"}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _import(client, model_id, content=b"fake gguf bytes", label="v1"):
    return await client.post(
        f"/api/v1/models/{model_id}/versions",
        files={"file": ("model.gguf", content, "application/octet-stream")},
        data={"version_label": label},
    )


# --- Import ----------------------------------------------------------


async def test_import_records_the_hash_of_what_was_actually_written(
    client, as_role, stub_clean_scan
):
    await as_role("ML Engineer")
    model = await _create_model(client)
    content = b"deterministic bytes for hashing"

    r = await _import(client, model["id"], content=content)
    assert r.status_code == 201, r.text
    assert r.json()["file_hash"] == hashlib.sha256(content).hexdigest()


async def test_an_infected_artifact_is_refused_and_never_becomes_startable(
    client, db, as_role, stub_infected_scan
):
    await as_role("ML Engineer")
    model = await _create_model(client)

    r = await _import(client, model["id"], content=b"pretend-eicar")
    assert r.status_code == 422, r.text
    assert "malware" in r.text.lower()

    # The row is deliberately still persisted — a blocked import is a
    # durable record, not something to discard — but it must be unusable.
    from sqlalchemy import select

    rows = (await db.execute(select(ModelVersion).where(ModelVersion.model_id == uuid.UUID(model["id"])))).scalars().all()
    for row in rows:
        assert row.malware_scan_result == MalwareScanResult.positive.value


async def test_a_flagged_import_is_audited(client, as_role, roles, make_identity, stub_infected_scan):
    await as_role("ML Engineer")
    model = await _create_model(client)
    await _import(client, model["id"], content=b"pretend-eicar")

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.get("/api/v1/audit-events?event_type=model_version.malware_scan_failed")
    assert r.status_code == 200, r.text
    assert r.json(), "a blocked import left no audit trail"


async def test_import_is_refused_when_the_scanner_is_unreachable(
    client, as_role, stub_scanner_down
):
    """Fail closed. An unavailable scanner must never be read as 'clean'."""
    await as_role("ML Engineer")
    model = await _create_model(client)
    r = await _import(client, model["id"], content=b"anything")
    assert r.status_code == 502, r.text
    assert "refused" in r.text.lower()


async def test_importing_requires_the_ml_engineer_role(client, as_role, stub_clean_scan):
    await as_role("ML Engineer")
    model = await _create_model(client)

    await as_role("Clinician")
    r = await _import(client, model["id"])
    assert r.status_code == 403, r.text


async def test_importing_into_an_unknown_model_is_404(client, as_role, stub_clean_scan):
    await as_role("ML Engineer")
    r = await _import(client, uuid.uuid4())
    assert r.status_code == 404, r.text


# --- Model metadata --------------------------------------------------


async def test_renaming_a_model_is_audited_with_the_previous_value(
    client, as_role, make_identity, roles
):
    """The name is the label an auditor sees beside historical approvals, so
    the old value has to survive the rename somewhere."""
    await as_role("ML Engineer")
    model = await _create_model(client, name="OriginalName")

    r = await client.patch(f"/api/v1/models/{model['id']}", json={"name": "NewName"})
    assert r.status_code == 200, r.text

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.get("/api/v1/audit-events?event_type=model.updated")
    assert r.status_code == 200, r.text
    events = r.json()
    assert events, "rename was not audited"
    changes = events[0]["payload"]["changes"]
    assert changes["name"]["from"] == "OriginalName"
    assert changes["name"]["to"] == "NewName"


async def test_a_no_op_rename_writes_nothing_to_the_append_only_log(
    client, as_role, make_identity, roles
):
    await as_role("ML Engineer")
    model = await _create_model(client, name="SameName")

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    before = len((await client.get("/api/v1/audit-events?event_type=model.updated")).json())

    await as_role("ML Engineer")
    r = await client.patch(f"/api/v1/models/{model['id']}", json={"name": "SameName"})
    assert r.status_code == 200, r.text

    client.act_as(admin, [roles["Platform Administrator"]])
    after = len((await client.get("/api/v1/audit-events?event_type=model.updated")).json())
    assert after == before, "a no-op edit appended an unremovable audit row"


# --- Starting: fail-closed on tampering -------------------------------


async def test_a_version_that_failed_its_scan_cannot_be_started(
    client, db, as_role, model_version, stub_ollama_runtime
):
    model_version.malware_scan_result = MalwareScanResult.positive.value
    await db.commit()

    await as_role("ML Engineer")
    r = await client.post(f"/api/v1/model-versions/{model_version.id}/start", json={})
    assert r.status_code == 409, r.text
    assert "malware" in r.text.lower()


async def test_start_refuses_when_the_artifact_hash_no_longer_matches(
    client, as_role, model_version, stub_ollama_runtime, tampered_artifact
):
    """Tampering after import: the bytes on disk no longer hash to what was
    recorded. Refusing to start is the fail-closed behaviour models.md
    requires — the alternative is serving something nobody approved."""
    await as_role("ML Engineer")
    r = await client.post(f"/api/v1/model-versions/{model_version.id}/start", json={})
    assert r.status_code == 409, r.text
    assert "hash mismatch" in r.text.lower()


async def test_a_hash_mismatch_on_start_is_audited(
    client, as_role, make_identity, roles, model_version, stub_ollama_runtime, tampered_artifact
):
    await as_role("ML Engineer")
    await client.post(f"/api/v1/model-versions/{model_version.id}/start", json={})

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.get("/api/v1/audit-events?resource_type=model_version")
    assert r.status_code == 200, r.text
    assert any("hash" in e["event_type"] for e in r.json()), "tampering left no audit trail"


async def test_runtime_state_404s_before_a_version_has_ever_been_started(
    client, as_role, model_version
):
    """No row until something starts it — an absent runtime state is a
    different fact from a stopped one."""
    await as_role("ML Engineer")
    r = await client.get(f"/api/v1/model-versions/{model_version.id}/runtime-state")
    assert r.status_code == 404, r.text


async def test_runtime_state_is_readable_once_it_exists(client, db, as_role, model_version):
    db.add(
        ModelRuntimeState(
            model_version_id=model_version.id, runtime_status=RuntimeStatus.stopped.value
        )
    )
    await db.commit()

    await as_role("ML Engineer")
    r = await client.get(f"/api/v1/model-versions/{model_version.id}/runtime-state")
    assert r.status_code == 200, r.text
    assert r.json()["runtime_status"] == RuntimeStatus.stopped.value


async def test_production_eligibility_requires_an_ai_governance_approval(
    client, db, as_role, model_version, tenant, make_identity
):
    db.add(
        ModelRuntimeState(
            model_version_id=model_version.id, runtime_status=RuntimeStatus.stopped.value
        )
    )
    await db.commit()

    await as_role("ML Engineer")
    r = await client.get(f"/api/v1/model-versions/{model_version.id}/runtime-state")
    assert r.json()["production_eligible"] is False

    from app.governance.models import ApprovalDecision, GovernanceApproval, ResourceType

    approver = await make_identity("AI Governance Officer")
    db.add(
        GovernanceApproval(
            id=uuid.uuid4(),
            tenant_id=tenant,
            resource_type=ResourceType.model_version.value,
            resource_id=model_version.id,
            category="ai_governance",
            decision=ApprovalDecision.approved.value,
            decided_by=approver.id,
        )
    )
    await db.commit()

    r = await client.get(f"/api/v1/model-versions/{model_version.id}/runtime-state")
    assert r.json()["production_eligible"] is True


async def test_unknown_version_is_404_across_the_runtime_surface(client, as_role):
    await as_role("ML Engineer")
    missing = uuid.uuid4()
    r = await client.get(f"/api/v1/model-versions/{missing}/runtime-state")
    assert r.status_code == 404, r.text
    for action in ("start", "stop"):
        r = await client.post(f"/api/v1/model-versions/{missing}/{action}", json={})
        assert r.status_code == 404, f"{action} returned {r.status_code}"


# --- The start/stop lifecycle ----------------------------------------


async def test_a_verified_artifact_starts_and_is_audited(
    client, as_role, make_identity, roles, model_version, stub_ollama_runtime, valid_artifact
):
    await as_role("ML Engineer")
    r = await client.post(f"/api/v1/model-versions/{model_version.id}/start", json={})
    assert r.status_code == 200, r.text
    assert r.json()["runtime_status"] == RuntimeStatus.running.value

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.get("/api/v1/audit-events?event_type=model_version.started")
    assert r.status_code == 200, r.text
    assert r.json(), "starting a model was not audited"


async def test_stopping_a_running_model_is_audited(
    client, as_role, make_identity, roles, model_version, stub_ollama_runtime, valid_artifact
):
    await as_role("ML Engineer")
    await client.post(f"/api/v1/model-versions/{model_version.id}/start", json={})

    r = await client.post(f"/api/v1/model-versions/{model_version.id}/stop", json={})
    assert r.status_code == 200, r.text
    assert r.json()["runtime_status"] == RuntimeStatus.stopped.value

    admin = await make_identity("Platform Administrator")
    client.act_as(admin, [roles["Platform Administrator"]])
    r = await client.get("/api/v1/audit-events?event_type=model_version.stopped")
    assert r.json(), "stopping a model was not audited"


async def test_stopping_an_already_stopped_model_is_a_no_op(
    client, as_role, model_version, stub_ollama_runtime
):
    """Idempotent by design — an operator retrying a stop should not get an
    error, and it should not write a second audit row for a state that did
    not change."""
    await as_role("ML Engineer")
    first = await client.post(f"/api/v1/model-versions/{model_version.id}/stop", json={})
    assert first.status_code == 200, first.text
    second = await client.post(f"/api/v1/model-versions/{model_version.id}/stop", json={})
    assert second.status_code == 200, second.text
    assert second.json()["runtime_status"] == RuntimeStatus.stopped.value


async def test_a_failing_runtime_backend_surfaces_as_502(
    client, as_role, model_version, valid_artifact, monkeypatch
):
    from app.models import router as models_router
    from app.models.ollama_client import OllamaError

    async def _fail(*a, **kw):
        raise OllamaError("model failed to load")

    monkeypatch.setattr(models_router._ollama, "create_model", _fail)

    await as_role("ML Engineer")
    r = await client.post(f"/api/v1/model-versions/{model_version.id}/start", json={})
    assert r.status_code == 502, r.text


async def test_starting_requires_a_privileged_role(
    client, as_role, model_version, stub_ollama_runtime, valid_artifact
):
    for role in ("Clinician", "Auditor", "Privacy Officer"):
        await as_role(role)
        r = await client.post(f"/api/v1/model-versions/{model_version.id}/start", json={})
        assert r.status_code == 403, f"{role} could start a model"


async def test_start_refuses_cleanly_when_the_artifact_file_is_gone(
    client, as_role, model_version, stub_ollama_runtime
):
    """The artifact was deleted after import. Previously this surfaced as an
    unhandled FileNotFoundError and a 500; an operator needs to be told
    which model is unusable, not handed an opaque server error."""
    await as_role("ML Engineer")
    r = await client.post(f"/api/v1/model-versions/{model_version.id}/start", json={})
    assert r.status_code == 409, r.text
    assert "missing" in r.text.lower()
