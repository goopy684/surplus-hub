"""user_daily_activity: per-user per-day activity for DAU/WAU/MAU

Revision ID: user_activity_001
Revises: push_prefs_001
Create Date: 2026-10-05
"""
from alembic import op
import sqlalchemy as sa

revision = 'user_activity_001'
down_revision = 'push_prefs_001'
branch_labels = None
depends_on = None

# Rows only start accruing at deploy, so seed history from what users already did.
# Visits without a write aren't recoverable, so pre-deploy days undercount DAU.
_BACKFILL = """
INSERT INTO user_daily_activity (user_id, date)
SELECT user_id, d FROM (
    SELECT seller_id AS user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date AS d FROM materials
    UNION SELECT sender_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM messages
    UNION SELECT buyer_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM chat_rooms
    UNION SELECT author_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM posts
    UNION SELECT author_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM comments
    UNION SELECT user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM material_likes
    UNION SELECT user_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM post_likes
    UNION SELECT reviewer_id, (created_at AT TIME ZONE 'Asia/Seoul')::date FROM reviews
) a
WHERE d IS NOT NULL AND user_id IN (SELECT id FROM users)
ON CONFLICT DO NOTHING
"""


def upgrade() -> None:
    op.create_table(
        'user_daily_activity',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint('user_id', 'date'),
    )
    op.create_index('ix_user_daily_activity_date', 'user_daily_activity', ['date'])
    if op.get_bind().dialect.name == 'postgresql':
        op.execute(_BACKFILL)


def downgrade() -> None:
    op.drop_index('ix_user_daily_activity_date', table_name='user_daily_activity')
    op.drop_table('user_daily_activity')
