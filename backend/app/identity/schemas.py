import uuid
from datetime import datetime

from pydantic import BaseModel


class RoleOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str


class RoleAssignmentOut(RoleOut):
    """One row of grant/revoke history, not just a role.

    Extends `RoleOut` additively — `id` is still the *role* id, so callers
    that only read id/name/kind (and the revoke endpoint, which takes a
    role id) are unaffected. `assignment_id` is what distinguishes two
    rows for the same role, which `include_revoked=true` can legitimately
    return: revoked assignments are never deleted, and re-granting after a
    revoke creates a new row.
    """

    assignment_id: uuid.UUID
    granted_by: uuid.UUID
    granted_at: datetime
    revoked_by: uuid.UUID | None
    revoked_at: datetime | None


class MeOut(BaseModel):
    id: uuid.UUID
    type: str
    email: str | None
    display_name: str | None
    service_client_id: str | None
    tenant_id: uuid.UUID
    active: bool
    roles: list[RoleOut]


class IdentityOut(BaseModel):
    id: uuid.UUID
    type: str
    email: str | None
    display_name: str | None
    service_client_id: str | None
    active: bool
    roles: list[RoleOut]


class GrantRoleIn(BaseModel):
    role_id: uuid.UUID


class ActiveIn(BaseModel):
    active: bool
