"""Add disposal_advisories table — 모듈 0 처분 경로 판별 게이트 (SH-48)

Revision ID: pretrade_disposal_gate_001
Revises: reports_pending_uq_001
Create Date: 2026-11-14
"""
from alembic import op
import sqlalchemy as sa

revision = 'pretrade_disposal_gate_001'
down_revision = 'reports_pending_uq_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'disposal_advisories',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('material_id', sa.Integer(), sa.ForeignKey('materials.id', ondelete='SET NULL'), nullable=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('condition_grade', sa.String(20), nullable=True),
        sa.Column('damage_level', sa.String(20), nullable=False, server_default='NONE'),
        sa.Column('is_mixed_waste', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('recyclable_material', sa.String(50), nullable=True),
        sa.Column('similar_active_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('similar_sold_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completed_trade_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('recommended_route', sa.String(20), nullable=False),
        sa.Column('selected_route', sa.String(20), nullable=False),
        sa.Column('can_override_to_reuse', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('override_reason', sa.Text(), nullable=True),
        sa.Column('reasoning', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_disposal_advisories_id', 'disposal_advisories', ['id'])
    op.create_index('ix_disposal_advisories_user_id', 'disposal_advisories', ['user_id'])
    op.create_index('ix_disposal_advisories_material_id', 'disposal_advisories', ['material_id'])


def downgrade() -> None:
    op.drop_index('ix_disposal_advisories_material_id', table_name='disposal_advisories')
    op.drop_index('ix_disposal_advisories_user_id', table_name='disposal_advisories')
    op.drop_index('ix_disposal_advisories_id', table_name='disposal_advisories')
    op.drop_table('disposal_advisories')
