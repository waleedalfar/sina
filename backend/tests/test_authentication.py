"""
Token validation — the one place where getting it wrong hands the platform
to anybody.

Unlike every other test file here, these do NOT stub `get_current_identity`:
they drive the real decode path with real RS256 tokens, signed by a key
this module generates and injects in place of Keycloak's JWKS. That is the
only way to assert the things that actually matter — that `alg: none` is
refused, that a token signed by the wrong key is refused, that expiry,
issuer and audience are all enforced rather than merely present.

See ADR-0004 and identity.md.
"""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import settings
from app.identity.security import get_current_identity
from app.main import app

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_WRONG_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _token(key=_KEY, alg="RS256", **overrides):
    now = datetime.now(UTC)
    claims = {
        "sub": overrides.pop("sub", uuid.uuid4().hex),
        "iss": settings.oidc_issuer,
        "aud": settings.oidc_audience,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "email": "person@test.local",
        "preferred_username": "person",
    }
    claims.update(overrides)
    if alg == "none":
        return jwt.encode(claims, key=None, algorithm=None)
    return jwt.encode(claims, key, algorithm=alg)


@pytest_asyncio.fixture
async def real_auth_client(_database, roles, monkeypatch):
    """A client using the genuine token-validation dependency."""
    from httpx import ASGITransport, AsyncClient

    class _StubSigningKey:
        key = _KEY.public_key()

    monkeypatch.setattr(
        "app.identity.security._jwk_client.get_signing_key_from_jwt",
        lambda token: _StubSigningKey(),
    )
    app.dependency_overrides.pop(get_current_identity, None)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _me(client, token=None):
    """Removes the auth override immediately before the call.

    Several tests need both clients: the real decode path for `/me`, and the
    stubbed one to read the audit log as an administrator. They share a
    single global `dependency_overrides` entry, so whichever fixture was
    constructed last would otherwise win — which silently made two of these
    tests pass against stubbed auth rather than the code they exist to
    test. Popping per call makes the intent explicit at the call site
    instead of depending on fixture ordering.
    """
    app.dependency_overrides.pop(get_current_identity, None)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return await client.get("/api/v1/me", headers=headers)


# --- Tokens that must be refused --------------------------------------


async def test_a_valid_token_resolves(real_auth_client, tenant):
    r = await _me(real_auth_client, _token())
    assert r.status_code == 200, r.text


async def test_no_authorization_header_is_401(real_auth_client, tenant):
    r = await _me(real_auth_client)
    assert r.status_code == 401, r.text


@pytest.mark.parametrize(
    "header",
    ["", "Bearer", "Basic abc123", "Token abc123", "bearer-ish nonsense"],
)
async def test_malformed_authorization_headers_are_401(real_auth_client, tenant, header):
    r = await real_auth_client.get("/api/v1/me", headers={"Authorization": header})
    assert r.status_code == 401, f"{header!r} was accepted"


async def test_an_unsigned_alg_none_token_is_refused(real_auth_client, tenant):
    """The classic JWT bypass. `algorithms=["RS256"]` is passed explicitly on
    every decode precisely so this cannot work."""
    r = await _me(real_auth_client, _token(alg="none"))
    assert r.status_code == 401, "an unsigned token was accepted"


async def test_a_token_signed_by_the_wrong_key_is_refused(real_auth_client, tenant):
    r = await _me(real_auth_client, _token(key=_WRONG_KEY))
    assert r.status_code == 401, "signature was not verified"


async def test_an_expired_token_is_refused(real_auth_client, tenant):
    past = datetime.now(UTC) - timedelta(hours=1)
    r = await _me(real_auth_client, _token(exp=past, iat=past - timedelta(minutes=5)))
    assert r.status_code == 401, "expiry was not enforced"


async def test_a_token_from_another_issuer_is_refused(real_auth_client, tenant):
    r = await _me(real_auth_client, _token(iss="https://evil.example.com/realms/other"))
    assert r.status_code == 401, "issuer was not enforced"


async def test_a_token_for_another_audience_is_refused(real_auth_client, tenant):
    r = await _me(real_auth_client, _token(aud="some-other-service"))
    assert r.status_code == 401, "audience was not enforced"


async def test_garbage_that_is_not_a_jwt_is_refused(real_auth_client, tenant):
    r = await _me(real_auth_client, "not.a.jwt")
    assert r.status_code == 401, r.text


# --- Provisioning and deactivation ------------------------------------


async def test_an_unknown_subject_is_provisioned_with_no_roles(real_auth_client, tenant):
    """Fail-closed: a valid token from an unknown person creates an identity
    that can do nothing until somebody grants it a role."""
    r = await _me(real_auth_client, _token(sub="brand-new-subject"))
    assert r.status_code == 200, r.text
    assert r.json()["roles"] == [], "JIT provisioning granted roles"


async def test_provisioning_is_audited(real_auth_client, client, tenant, as_role):
    await _me(real_auth_client, _token(sub=f"audited-{uuid.uuid4().hex}"))

    await as_role("Platform Administrator")
    r = await client.get("/api/v1/audit-events?event_type=identity.provisioned")
    assert r.status_code == 200, r.text
    assert r.json(), "provisioning emitted no audit event"


async def test_the_same_subject_resolves_to_one_identity(real_auth_client, tenant):
    subject = f"stable-{uuid.uuid4().hex}"
    first = await _me(real_auth_client, _token(sub=subject))
    second = await _me(real_auth_client, _token(sub=subject))
    assert first.json()["id"] == second.json()["id"], "a second login forked the identity"


async def test_identity_is_keyed_by_issuer_as_well_as_subject(real_auth_client, tenant, monkeypatch):
    """Two IdPs can legitimately issue the same `sub`. Keying on subject
    alone would merge two different people into one account."""
    subject = f"collide-{uuid.uuid4().hex}"
    first = await _me(real_auth_client, _token(sub=subject))
    assert first.status_code == 200

    other_issuer = "http://localhost:8080/realms/second-realm"
    monkeypatch.setattr(settings, "oidc_issuer", other_issuer)
    second = await _me(real_auth_client, _token(sub=subject, iss=other_issuer))
    assert second.status_code == 200, second.text
    assert first.json()["id"] != second.json()["id"], "identities collided across issuers"


async def test_a_deactivated_identity_is_refused_even_with_a_valid_token(
    real_auth_client, client, as_role, tenant, db
):
    subject = f"deactivated-{uuid.uuid4().hex}"
    r = await _me(real_auth_client, _token(sub=subject))
    assert r.status_code == 200
    identity_id = r.json()["id"]

    await as_role("Platform Administrator")
    r = await client.patch(f"/api/v1/identities/{identity_id}/active", json={"active": False})
    assert r.status_code == 200, r.text

    r = await _me(real_auth_client, _token(sub=subject))
    assert r.status_code == 401, "a deactivated identity still authenticated"


async def test_rejected_authentication_is_audited_as_security_critical(
    real_auth_client, client, as_role, tenant
):
    await _me(real_auth_client, _token(key=_WRONG_KEY))

    await as_role("Platform Administrator")
    r = await client.get("/api/v1/audit-events?event_type=identity.auth_rejected")
    assert r.status_code == 200, r.text
    events = r.json()
    assert events, "a rejected token emitted no audit event"
    assert events[0]["severity"] == "security_critical"
