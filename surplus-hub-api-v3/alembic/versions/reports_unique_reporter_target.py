"""Unique (reporter_id, target_type, target_id) on reports (SH-40)

Existing duplicates are removed first, keeping each reporter's earliest report
on a target, so the constraint can be created on databases that already have them.

Revision ID: reports_uq_001
Revises: sprint5_001
Create Date: 2026-11-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'reports_uq_001'
down_revision = 'sprint5_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    deleted = op.get_bind().execute(sa.text(
        "DELETE FROM reports WHERE id NOT IN ("
        "SELECT MIN(id) FROM reports GROUP BY reporter_id, target_type, target_id)"
    )).rowcount
    print(f"reports_uq_001: removed {deleted} duplicate report(s)")
    op.create_unique_constraint(
        "uq_report_reporter_target",
        "reports",
        ["reporter_id", "target_type", "target_id"],
    )


def downgrade() -> None:
    # 삭제한 중복 신고는 복구하지 않는다
    op.drop_constraint("uq_report_reporter_target", "reports", type_="unique")
