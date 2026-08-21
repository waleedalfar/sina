import uuid
from datetime import UTC, datetime

import jwt
from fastapi import Depends, Header
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import Severity
from app.audit.service import emit as audit_emit
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import AuthenticationFailed
from app.identity.models import Identity, IdentityType, Role, RoleAssignment

# PyJWKClient caches the JWKS response and handles rotation — this is the
# "maintained OIDC/JWT library, never a hand-rolled decoder" requirement
# from ADR-0004/identity.md. No `alg: none` acceptance: `algorithms=` below
# is passed explicitly on every decode call.
_jwk_client = PyJWKClient(settings.oidc_jwks_url)


class ResolvedIdentity:
    def __init__(self, identity: Identity, roles: list[Role]):
        self.identity = identity
        self.roles = roles
        self.role_names: set[str] = {r.name for r in roles}
        self.role_kinds: set[str] = {r.kind for r in roles}


def _is_service_account(claims: dict) -> bool:
    """
    Keycloak client_credentials tokens (service/application identities, per
    ADR-0004) carry a service-account username and a client_id claim that
    ordinary human-login tokens don't. Checked defensively on more than one
    signal since exact claim shapes vary slightly by Keycloak version —
    verify against a real token during end-to-end testing (task #5) and
    tighten if needed.
    """
    preferred_username = claims.get("preferred_username", "") or ""
    return (
        preferred_username.startswith("service-account-")
        or "client_id" in claims
        or "clientId" in claims
    )


async def _audit_rejected_and_commit(
    db: AsyncSession, tenant_id: uuid.UUID, reason: str, issuer: str | None = None, subject: str | None = None
) -> None:
    """
    Committed immediately, not left to get_db's usual commit-on-success —
    we're about to raise past that point. This rejection *is* the whole
    action; there's nothing else it needs to stay atomic with. See
    audit.md's transactional-emission rule and this module's docstring in
    identity.md's Security section.
    """
    await audit_emit(
        db,
        tenant_id=tenant_id,
        event_type="identity.auth_rejected",
        actor_identity_id=None,
        payload={"issuer": issuer, "external_subject": subject, "reason": reason},
        severity=Severity.security_critical,
    )
    await db.commit()


async def get_current_identity(
    authorization: str = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> ResolvedIdentity:
    tenant_id = uuid.UUID(settings.default_tenant_id)

    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationFailed("missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.oidc_audience,
            issuer=settings.oidc_issuer,
        )
    except jwt.PyJWTError as exc:
        await _audit_rejected_and_commit(db, tenant_id, reason=str(exc))
        raise AuthenticationFailed("invalid token") from exc

    subject = claims.get("sub")
    issuer = claims.get("iss")
    is_service = _is_service_account(claims)

    result = await db.execute(
        select(Identity).where(Identity.issuer == issuer, Identity.external_subject == subject)
    )
    identity = result.scalar_one_or_none()

    if identity is None:
        # JIT provisioning — fail-closed: no roles granted here. See
        # identity.md's "Fail-closed provisioning" rule.
        identity = Identity(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            external_subject=subject,
            issuer=issuer,
            type=IdentityType.service.value if is_service else IdentityType.human.value,
            email=claims.get("email"),
            display_name=claims.get("name") or claims.get("preferred_username"),
            service_client_id=claims.get("client_id") or claims.get("clientId") if is_service else None,
            active=True,
        )
        db.add(identity)
        await db.flush()
        await audit_emit(
            db,
            tenant_id=tenant_id,
            event_type="identity.provisioned",
            actor_identity_id=identity.id,
            resource_type="identity",
            resource_id=identity.id,
            payload={"type": identity.type, "issuer": issuer, "external_subject": subject},
        )
        await db.commit()

    if not identity.active:
        await _audit_rejected_and_commit(
            db, tenant_id, reason="identity deactivated", issuer=issuer, subject=subject
        )
        raise AuthenticationFailed("identity deactivated")

    roles_result = await db.execute(
        select(Role)
        .join(RoleAssignment, RoleAssignment.role_id == Role.id)
        .where(RoleAssignment.identity_id == identity.id, RoleAssignment.revoked_at.is_(None))
    )
    roles = list(roles_result.scalars().all())

    identity.last_seen_at = datetime.now(UTC)
    await db.commit()

    return ResolvedIdentity(identity, roles)


def require_role(*allowed_role_names: str):
    async def _dep(current: ResolvedIdentity = Depends(get_current_identity)) -> ResolvedIdentity:
        from app.core.exceptions import PolicyDenied

        if not (current.role_names & set(allowed_role_names)):
            raise PolicyDenied(f"requires one of roles: {', '.join(allowed_role_names)}")
        return current

    return _dep


def require_role_kind(*allowed_kinds: str):
    async def _dep(current: ResolvedIdentity = Depends(get_current_identity)) -> ResolvedIdentity:
        from app.core.exceptions import PolicyDenied

        if not (current.role_kinds & set(allowed_kinds)):
            raise PolicyDenied(f"requires a role of kind: {', '.join(allowed_kinds)}")
        return current

    return _dep
