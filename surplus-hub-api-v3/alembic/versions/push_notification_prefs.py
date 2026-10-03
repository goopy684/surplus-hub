"""Add push notification preferences to users

Revision ID: push_prefs_001
Revises: bce26a8f5d08
Create Date: 2026-08-03

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'push_prefs_001'
down_revision = 'bce26a8f5d08'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('push_enabled', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('push_chat', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('push_material', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('push_community', sa.Boolean(), nullable=False, server_default='true'))
    # 정보통신망법상 광고성 정보는 옵트인
    op.add_column('users', sa.Column('push_marketing', sa.Boolean(), nullable=False, server_default='false'))
    # 수신동의 시각(보존 의무). 철회 시 NULL
    op.add_column('users', sa.Column('push_marketing_consented_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'push_marketing_consented_at')
    op.drop_column('users', 'push_marketing')
    op.drop_column('users', 'push_community')
    op.drop_column('users', 'push_material')
    op.drop_column('users', 'push_chat')
    op.drop_column('users', 'push_enabled')
