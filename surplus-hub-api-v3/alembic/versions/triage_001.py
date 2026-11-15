"""거래 전 AI 유동성 진단(Pre-Transaction Triage)

신규 테이블 ai_triage_diagnoses + 기존 테이블 nullable 컬럼 추가(데이터 파괴 없음):
materials.liquidity_score / disposition_path, search_logs.location_lat / location_lng.

Revision ID: triage_001
Revises: reports_pending_uq_001
Create Date: 2026-11-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'triage_001'
down_revision = 'reports_pending_uq_001'
branch_labels = None
depends_on = None

TABLE = 'ai_triage_diagnoses'


def upgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='DIAGNOSED'),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('material_key', sa.String(), nullable=True),
        sa.Column('condition_grade', sa.String(), nullable=True),
        sa.Column('spec_text', sa.Text(), nullable=True),
        sa.Column('image_urls', sa.JSON(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=True),
        sa.Column('quantity_unit', sa.String(), nullable=True),
        sa.Column('weight_kg', sa.Float(), nullable=True),
        sa.Column('weight_estimated', sa.Boolean(), nullable=True),
        sa.Column('location_address', sa.String(), nullable=True),
        sa.Column('location_lat', sa.Float(), nullable=True),
        sa.Column('location_lng', sa.Float(), nullable=True),
        sa.Column('liquidity_score', sa.Integer(), nullable=False),
        sa.Column('initial_score', sa.Integer(), nullable=False),
        sa.Column('last_notified_score', sa.Integer(), nullable=True),
        sa.Column('match_probability', sa.Integer(), nullable=True),
        sa.Column('expected_days', sa.Integer(), nullable=True),
        sa.Column('score_breakdown', sa.JSON(), nullable=True),
        sa.Column('cold_start', sa.Boolean(), nullable=True),
        sa.Column('analysis_mode', sa.String(), nullable=True),
        sa.Column('disposition_path', sa.String(), nullable=True),
        sa.Column('loss_mixed_waste', sa.Integer(), nullable=True),
        sa.Column('scrap_value', sa.Integer(), nullable=True),
        sa.Column('direct_sale_price', sa.Integer(), nullable=True),
        sa.Column('net_benefit', sa.Integer(), nullable=True),
        sa.Column('price_basis', sa.String(), nullable=True),
        sa.Column('share_token', sa.String(), nullable=False),
        sa.Column(
            'material_id', sa.Integer(),
            sa.ForeignKey('materials.id', ondelete='SET NULL'), nullable=True,
        ),
        sa.Column('vault_saved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('listed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reopened_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(f'ix_{TABLE}_id', TABLE, ['id'])
    op.create_index(f'ix_{TABLE}_user_id', TABLE, ['user_id'])
    op.create_index(f'ix_{TABLE}_status', TABLE, ['status'])
    op.create_index(f'ix_{TABLE}_disposition_path', TABLE, ['disposition_path'])
    op.create_index(f'ix_{TABLE}_share_token', TABLE, ['share_token'], unique=True)

    op.add_column('materials', sa.Column('liquidity_score', sa.Integer(), nullable=True))
    op.add_column('materials', sa.Column('disposition_path', sa.String(), nullable=True))
    op.add_column('search_logs', sa.Column('location_lat', sa.Float(), nullable=True))
    op.add_column('search_logs', sa.Column('location_lng', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('search_logs') as batch:
        batch.drop_column('location_lng')
        batch.drop_column('location_lat')
    with op.batch_alter_table('materials') as batch:
        batch.drop_column('disposition_path')
        batch.drop_column('liquidity_score')

    for name in ('share_token', 'disposition_path', 'status', 'user_id', 'id'):
        op.drop_index(f'ix_{TABLE}_{name}', table_name=TABLE)
    op.drop_table(TABLE)
