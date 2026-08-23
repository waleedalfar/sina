import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import emit as audit_emit
from app.core.db import get_db
from app.core.exceptions import Conflict, NotFound
from app.identity.models import Identity, Role, RoleAssignment
from app.identity.roles import find_conflicting_kind
from app.identity.schemas import (
    ActiveIn,
    GrantRoleIn,
    IdentityOut,
    MeOut,
    RoleAssignmentOut,
    RoleOut,
)
from app.identity.security import ResolvedIdentity, get_current_identity, require_role

router = APIRouter(prefix="/api/v1", tags=["identity"])


def _to_role_out(role: Role) -> RoleOut:
    return RoleOut(id=role.id, name=role.name, kind=role.kind)


async def _load_roles(db: AsyncSession, identity_id: uuid.UUID) -> list[Role]:
    result = await db.execute(
        select(Role)
        .join(RoleAssignment, RoleAssignment.role_id == Role.id)
        .where(RoleAssignment.identity_id == identity_id, RoleAssignment.revoked_at.is_(None))
    )
    return list(result.scalars().all())


def _identity_out(ident: Identity, roles: list[Role]) -> IdentityOut:
    return IdentityOut(
        id=ident.id,
        type=ident.type,
        email=ident.email,
        display_name=ident.display_name,
        service_client_id=ident.service_client_id,
        active=ident.active,
        roles=[_to_role_out(r) for r in roles],
    )


@router.get("/me", response_model=MeOut)
async def get_me(current: ResolvedIdentity = Depends(get_current_identity)):
    return MeOut(
        id=current.identity.id,
        type=current.identity.type,
        email=current.identity.email,
        display_name=current.identity.display_name,
        service_client_id=current.identity.service_client_id,
        tenant_id=current.identity.tenant_id,
        active=current.identity.active,
        roles=[_to_role_out(r) for r in current.roles],
    )


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(get_current_identity),
):
    """
    Closes a real gap found during live testing: there was no way to
    discover role ids other than already-held roles, so granting an
    unheld role required querying Postgres directly. Broad read access,
    matching the pattern for other reference-data reads in this codebase.
    """
    result = await db.execute(select(Role))
    return [_to_role_out(r) for r in result.scalars().all()]


@router.get("/identities", response_model=list[IdentityOut])
async def list_identities(
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(require_role("Platform Administrator")),
):
    result = await db.execute(select(Identity))
    identities = list(result.scalars().all())
    out = []
    for ident in identities:
        roles = await _load_roles(db, ident.id)
        out.append(_identity_out(ident, roles))
    return out


@router.get("/identities/{identity_id}/roles", response_model=list[RoleAssignmentOut])
async def list_identity_roles(
    identity_id: uuid.UUID,
    include_revoked: bool = Query(
        default=False,
        description="Include revoked assignments — the full grant/revoke history, not just what is held now.",
    ),
    db: AsyncSession = Depends(get_db),
    _: ResolvedIdentity = Depends(require_role("Platform Administrator")),
):
    """
    Currently-held roles by default; the full history with
    `?include_revoked=true`.

    The history was always in the table — `RoleAssignment` rows are
    revoked, never deleted — but nothing read it back, so who held what
    and when was only recoverable from the audit log. This endpoint
    returns assignments rather than bare roles precisely because a history
    can legitimately contain the same role more than once.

    404s on an unknown identity rather than returning `[]`, matching the
    grant/revoke/deactivate endpoints. An empty list here means "this
    identity has never held a role", which is a different fact from "no
    such identity" — and this endpoint is read for audit purposes, where
    conflating the two is exactly the kind of thing that misleads.
    """
    if await db.get(Identity, identity_id) is None:
        raise NotFound(f"identity {identity_id} not found")

    stmt = (
        select(Role, RoleAssignment)
        .join(RoleAssignment, RoleAssignment.role_id == Role.id)
        .where(RoleAssignment.identity_id == identity_id)
        .order_by(RoleAssignment.granted_at.desc())
    )
    if not include_revoked:
        stmt = stmt.where(RoleAssignment.revoked_at.is_(None))

    result = await db.execute(stmt)
    return [
        RoleAssignmentOut(
            id=role.id,
            name=role.name,
            kind=role.kind,
            assignment_id=assignment.id,
            granted_by=assignment.granted_by,
            granted_at=assignment.granted_at,
            revoked_by=assignment.revoked_by,
            revoked_at=assignment.revoked_at,
        )
        for role, assignment in result.all()
    ]


@router.post("/identities/{identity_id}/roles", response_model=RoleOut, status_code=201)
async def grant_role(
    identity_id: uuid.UUID,
    body: GrantRoleIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("Platform Administrator")),
):
    target = await db.get(Identity, identity_id)
    if target is None:
        raise NotFound(f"identity {identity_id} not found")

    role = await db.get(Role, body.role_id)
    if role is None:
        raise NotFound(f"role {body.role_id} not found")

    held_roles = await _load_roles(db, identity_id)
    held_kinds = {r.kind for r in held_roles}
    held_names = {r.name for r in held_roles}

    if role.name in held_names:
        raise Conflict(f"identity already holds role {role.name!r}")

    conflicting_kind = find_conflicting_kind(role.kind, held_kinds)
    if conflicting_kind is not None:
        conflicting_role = next(r for r in held_roles if r.kind == conflicting_kind)
        raise Conflict(
            f"granting {role.name!r} (kind={role.kind}) conflicts with already-held role "
            f"{conflicting_role.name!r} (kind={conflicting_kind}) — see identity.md's "
            f"separation-of-duties matrix"
        )

    assignment = RoleAssignment(
        id=uuid.uuid4(),
        identity_id=identity_id,
        role_id=role.id,
        granted_by=current.identity.id,
    )
    db.add(assignment)
    await audit_emit(
        db,
        tenant_id=target.tenant_id,
        event_type="identity.role_granted",
        actor_identity_id=current.identity.id,
        resource_type="identity",
        resource_id=identity_id,
        payload={"role": role.name, "granted_by": str(current.identity.id)},
    )
    await db.commit()
    return _to_role_out(role)


@router.delete("/identities/{identity_id}/roles/{role_id}", status_code=204)
async def revoke_role(
    identity_id: uuid.UUID,
    role_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("Platform Administrator")),
):
    target = await db.get(Identity, identity_id)
    if target is None:
        raise NotFound(f"identity {identity_id} not found")

    result = await db.execute(
        select(RoleAssignment).where(
            RoleAssignment.identity_id == identity_id,
            RoleAssignment.role_id == role_id,
            RoleAssignment.revoked_at.is_(None),
        )
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise NotFound("active role assignment not found")

    role = await db.get(Role, role_id)
    assignment.revoked_by = current.identity.id
    assignment.revoked_at = datetime.now(UTC)
    await audit_emit(
        db,
        tenant_id=target.tenant_id,
        event_type="identity.role_revoked",
        actor_identity_id=current.identity.id,
        resource_type="identity",
        resource_id=identity_id,
        payload={"role": role.name if role else str(role_id), "revoked_by": str(current.identity.id)},
    )
    await db.commit()


@router.patch("/identities/{identity_id}/active", response_model=IdentityOut)
async def set_active(
    identity_id: uuid.UUID,
    body: ActiveIn,
    db: AsyncSession = Depends(get_db),
    current: ResolvedIdentity = Depends(require_role("Platform Administrator")),
):
    target = await db.get(Identity, identity_id)
    if target is None:
        raise NotFound(f"identity {identity_id} not found")

    target.active = body.active
    event_type = "identity.reactivated" if body.active else "identity.deactivated"
    await audit_emit(
        db,
        tenant_id=target.tenant_id,
        event_type=event_type,
        actor_identity_id=current.identity.id,
        resource_type="identity",
        resource_id=identity_id,
        payload={"changed_by": str(current.identity.id)},
    )
    await db.commit()
    roles = await _load_roles(db, identity_id)
    return _identity_out(target, roles)
