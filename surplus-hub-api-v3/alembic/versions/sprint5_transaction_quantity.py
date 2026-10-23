"""Add quantity to transactions (수량별 분할 거래)

Revision ID: sprint5_001
Revises: user_activity_001
Create Date: 2026-10-21

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'sprint5_001'
down_revision = 'user_activity_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('transactions', sa.Column('quantity', sa.Integer(), nullable=True))
    op.add_column(
        'transactions',
        sa.Column('is_partial', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('transactions', 'is_partial')
    op.drop_column('transactions', 'quantity')
