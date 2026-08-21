"""audit tamper-evidence triggers and app_runtime role privileges

Revision ID: d4fe470591dd
Revises: 27e0333fad26
Create Date: 2026-08-21 00:32:51.599511

Implements audit.md's two tamper-evidence layers:

1. A single `audit_event_compute_hash` SQL function, called both by the
   BEFORE INSERT trigger (to populate prev_event_hash/event_hash) and by
   the /verify-integrity endpoint (to recompute and compare) — one
   implementation, not two independently-maintained ones that could drift.
2. BEFORE UPDATE/DELETE triggers that reject mutation outright, plus the
   `app_runtime` role (used for the application's normal runtime
   connection) getting no UPDATE/DELETE grant on audit_event at all — the
   privilege revocation is the primary enforcement; the triggers are a
   second, independent layer (e.g. against a role that somehow still holds
   the grant), consistent with audit.md's "structural, not conventional"
   standard.
"""

from typing import Sequence, Union

from alembic import op

from app.core.config import settings

# revision identifiers, used by Alembic.
revision: str = "d4fe470591dd"
down_revision: Union[str, None] = "27e0333fad26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_event_compute_hash(
            p_prev_hash text,
            p_id uuid,
            p_event_type text,
            p_occurred_at timestamptz,
            p_actor_identity_id uuid,
            p_resource_type text,
            p_resource_id uuid,
            p_payload jsonb
        ) RETURNS text AS $$
        DECLARE
            canonical text;
        BEGIN
            canonical := coalesce(p_prev_hash, '') || '|' ||
                         p_id::text || '|' ||
                         p_event_type || '|' ||
                         extract(epoch from p_occurred_at)::text || '|' ||
                         coalesce(p_actor_identity_id::text, '') || '|' ||
                         coalesce(p_resource_type, '') || '|' ||
                         coalesce(p_resource_id::text, '') || '|' ||
                         p_payload::text;
            RETURN encode(digest(canonical, 'sha256'), 'hex');
        END;
        $$ LANGUAGE plpgsql IMMUTABLE
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_event_before_insert() RETURNS trigger AS $$
        DECLARE
            prev_hash text;
        BEGIN
            SELECT event_hash INTO prev_hash FROM audit_event ORDER BY sequence_number DESC LIMIT 1;
            NEW.prev_event_hash := prev_hash;
            NEW.event_hash := audit_event_compute_hash(
                prev_hash, NEW.id, NEW.event_type, NEW.occurred_at,
                NEW.actor_identity_id, NEW.resource_type, NEW.resource_id, NEW.payload
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_event_before_insert_trigger
        BEFORE INSERT ON audit_event
        FOR EACH ROW EXECUTE FUNCTION audit_event_before_insert()
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_event_block_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_event rows are immutable (append-only) — see audit.md';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_event_block_update
        BEFORE UPDATE ON audit_event
        FOR EACH ROW EXECUTE FUNCTION audit_event_block_mutation()
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_event_block_delete
        BEFORE DELETE ON audit_event
        FOR EACH ROW EXECUTE FUNCTION audit_event_block_mutation()
        """
    )

    # app_runtime: the role the application connects as at runtime. Gets
    # full CRUD on every table EXCEPT audit_event, where UPDATE/DELETE are
    # explicitly revoked — see audit.md's Design decision.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_runtime') THEN
                CREATE ROLE app_runtime LOGIN PASSWORD '{settings.app_runtime_password}';
            END IF;
        END
        $$
        """
    )
    op.execute("GRANT CONNECT ON DATABASE hospital_platform TO app_runtime")
    op.execute("GRANT USAGE ON SCHEMA public TO app_runtime")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime")
    op.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime")
    op.execute("REVOKE UPDATE, DELETE ON audit_event FROM app_runtime")
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_event_block_delete ON audit_event")
    op.execute("DROP TRIGGER IF EXISTS audit_event_block_update ON audit_event")
    op.execute("DROP TRIGGER IF EXISTS audit_event_before_insert_trigger ON audit_event")
    op.execute("DROP FUNCTION IF EXISTS audit_event_block_mutation()")
    op.execute("DROP FUNCTION IF EXISTS audit_event_before_insert()")
    op.execute("DROP FUNCTION IF EXISTS audit_event_compute_hash(text, uuid, text, timestamptz, uuid, text, uuid, jsonb)")
    op.execute("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_runtime")
    op.execute("DROP ROLE IF EXISTS app_runtime")
