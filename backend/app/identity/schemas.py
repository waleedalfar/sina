import uuid

from pydantic import BaseModel


class RoleOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str


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
