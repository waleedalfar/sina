"""
One-time local-dev bootstrap: the default Tenant, the ten MVP 0.1 Role rows,
and a handful of test Identities pre-created to match fixed user IDs in
infra/keycloak/realm-export.json — including the very first Platform
Administrator grant, done as a direct DB write rather than through the API,
exactly as identity.md documents ("the first Platform Administrator's
RoleAssignment row is created by the same seed script that creates the
synthetic test identities... a one-time bootstrap step").

Run with: python -m app.seed
"""

import asyncio
import uuid

from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.identity.models import Identity, IdentityType, Role, RoleAssignment, Tenant
from app.identity.roles import SEED_ROLES

DEFAULT_TENANT_ID = uuid.UUID(settings.default_tenant_id)

# Fixed Keycloak user ids — must match infra/keycloak/realm-export.json.
# One test identity per representative role kind, enough to exercise the
# separation-of-duties matrix (e.g. granting a sign-off role to the
# Application Developer identity should be rejected with 409).
SEED_IDENTITIES = [
    # (external_subject, email, display_name, role_name)
    ("00000000-0000-0000-0000-000000000001", "admin@example.org", "Platform Admin (seed)", "Platform Administrator"),
    ("00000000-0000-0000-0000-000000000002", "ml-engineer-1@example.org", "ML Engineer (seed)", "ML Engineer"),
    ("00000000-0000-0000-0000-000000000003", "app-developer-1@example.org", "App Developer (seed)", "Application Developer"),
    ("00000000-0000-0000-0000-000000000004", "clinical-safety-1@example.org", "Clinical Safety Reviewer (seed)", "Clinical Safety Reviewer"),
    ("00000000-0000-0000-0000-000000000005", "auditor-1@example.org", "Auditor (seed)", "Auditor"),
    ("00000000-0000-0000-0000-000000000006", "privacy-officer-1@example.org", "Privacy Officer (seed)", "Privacy Officer"),
    ("00000000-0000-0000-0000-000000000007", "security-admin-1@example.org", "Security Administrator (seed)", "Security Administrator"),
    ("00000000-0000-0000-0000-000000000008", "ai-governance-officer-1@example.org", "AI Governance Officer (seed)", "AI Governance Officer"),
    ("00000000-0000-0000-0000-000000000009", "compliance-officer-1@example.org", "Compliance Officer (seed)", "Compliance Officer"),
]


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        tenant = await db.get(Tenant, DEFAULT_TENANT_ID)
        if tenant is None:
            tenant = Tenant(id=DEFAULT_TENANT_ID, name="Default Tenant (MVP 0.1)")
            db.add(tenant)
            await db.flush()
            print(f"created tenant {tenant.id}")

        role_by_name: dict[str, Role] = {}
        for name, kind, description in SEED_ROLES:
            result = await db.execute(select(Role).where(Role.name == name))
            role = result.scalar_one_or_none()
            if role is None:
                role = Role(id=uuid.uuid4(), name=name, kind=kind.value, description=description)
                db.add(role)
                await db.flush()
                print(f"created role {role.name} ({role.kind})")
            role_by_name[name] = role

        platform_admin_identity: Identity | None = None
        for external_subject, email, display_name, role_name in SEED_IDENTITIES:
            result = await db.execute(
                select(Identity).where(
                    Identity.issuer == settings.oidc_issuer,
                    Identity.external_subject == external_subject,
                )
            )
            identity = result.scalar_one_or_none()
            if identity is None:
                identity = Identity(
                    id=uuid.uuid4(),
                    tenant_id=DEFAULT_TENANT_ID,
                    external_subject=external_subject,
                    issuer=settings.oidc_issuer,
                    type=IdentityType.human.value,
                    email=email,
                    display_name=display_name,
                    active=True,
                )
                db.add(identity)
                await db.flush()
                print(f"created identity {identity.display_name} ({identity.id})")

            if role_name == "Platform Administrator":
                platform_admin_identity = identity

        assert platform_admin_identity is not None, "seed data must include a Platform Administrator"

        for external_subject, _email, _display_name, role_name in SEED_IDENTITIES:
            result = await db.execute(
                select(Identity).where(
                    Identity.issuer == settings.oidc_issuer,
                    Identity.external_subject == external_subject,
                )
            )
            identity = result.scalar_one()
            role = role_by_name[role_name]

            existing = await db.execute(
                select(RoleAssignment).where(
                    RoleAssignment.identity_id == identity.id,
                    RoleAssignment.role_id == role.id,
                    RoleAssignment.revoked_at.is_(None),
                )
            )
            if existing.scalar_one_or_none() is not None:
                continue

            assignment = RoleAssignment(
                id=uuid.uuid4(),
                identity_id=identity.id,
                role_id=role.id,
                # Bootstrap: the platform admin grants everyone's initial
                # role, including its own — there is no other admin yet.
                granted_by=platform_admin_identity.id,
            )
            db.add(assignment)
            print(f"granted {role.name} to {identity.display_name}")

        await db.commit()
        print("seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
