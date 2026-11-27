"""구매 요청(구해요/RFQ)

신규 테이블 wanted_requests만 추가한다(기존 테이블 무변경 — downgrade는 테이블 삭제).

Revision ID: wanted_001
Revises: triage_001
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'wanted_001'
down_revision = 'triage_001'
branch_labels = None
depends_on = None

TABLE = 'wanted_requests'


def upgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('title', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=True),
        sa.Column('quantity_unit', sa.String(), nullable=True),
        sa.Column('budget_max', sa.Integer(), nullable=True),
        sa.Column('location_address', sa.String(), nullable=False),
        sa.Column('location_lat', sa.Float(), nullable=False),
        sa.Column('location_lng', sa.Float(), nullable=False),
        sa.Column('radius_km', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('status', sa.String(), nullable=False, server_default='OPEN'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_notified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    for name in ('id', 'user_id', 'category', 'status'):
        op.create_index(f'ix_{TABLE}_{name}', TABLE, [name])


def downgrade() -> None:
    for name in ('status', 'category', 'user_id', 'id'):
        op.drop_index(f'ix_{TABLE}_{name}', table_name=TABLE)
    op.drop_table(TABLE)
