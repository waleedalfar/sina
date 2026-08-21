import uuid
from collections.abc import AsyncGenerator

from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class TenantScopedMixin:
    """
    Every domain entity carries tenant_id from day one, per
    core-entities.md: "every entity...carries a tenant_id, even if MVP 0.1
    implements a single default tenant, to avoid a breaking migration."
    """

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenant.id"), nullable=False
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Endpoints commit explicitly (see identity/router.py) once the action
    and its audit event are both staged — that single commit is what makes
    them atomic (audit.md's "emission is transactional with the action"
    rule). This dependency's only job is to roll back if anything raises
    before that commit happens.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
