"""model version verification tier (ADR-0006)

Revision ID: a3c91e5d7b20
Revises: f8a14673e4f2
Create Date: 2026-10-20 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3c91e5d7b20'
down_revision: Union[str, None] = 'f8a14673e4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # malware_scan_result is plain text with the enum enforced in Python, so
    # the new `not_scannable_size` value needs no schema change.
    op.add_column('model_version', sa.Column('publisher_sha256', sa.Text(), nullable=True))
    op.add_column('model_version', sa.Column('chat_template', sa.Text(), nullable=True))
    op.add_column('model_version', sa.Column('chat_template_sha256', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('model_version', 'chat_template_sha256')
    op.drop_column('model_version', 'chat_template')
    op.drop_column('model_version', 'publisher_sha256')
