"""One pending report per (reporter, target) — partial unique index (SH-40)

No report row is deleted: handled reports keep their status, reviewer and audit
trail. Extra *pending* duplicates (same reporter and target) are closed as
'dismissed' with a note appended to their description, keeping the oldest one
pending, so the partial unique index can be built. downgrade reopens them.

Revision ID: reports_pending_uq_001
Revises: sprint5_001
Create Date: 2026-11-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'reports_pending_uq_001'
down_revision = 'sprint5_001'
branch_labels = None
depends_on = None

INDEX = "uq_report_pending_reporter_target"
NOTE = "\n\n[자동 종결] 같은 신고자의 중복 신고(SH-40 마이그레이션) — 남긴 신고 #"


def strip_note(description):
    """upgrade가 붙인 마지막 접미사(NOTE + 남긴 신고 id) 하나만 뗀 원문. 정확히 그 접미사로 끝나지 않으면 None."""
    head, sep, kept_id = (description or "").rpartition(NOTE)
    if not sep or not kept_id.isdigit():
        return None
    return head


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # 정리와 인덱스 생성 사이에 새 pending 중복이 끼어들지 못하게 (읽기는 허용)
        op.execute("LOCK TABLE reports IN SHARE ROW EXCLUSIVE MODE")

    rows = bind.execute(sa.text(
        "SELECT id, reporter_id, target_type, target_id, description FROM reports "
        "WHERE status = 'pending' ORDER BY id"
    )).all()
    kept = {}
    closed = 0
    for row in rows:
        key = (row.reporter_id, row.target_type, row.target_id)
        if key not in kept:
            kept[key] = row.id
            continue
        bind.execute(
            sa.text("UPDATE reports SET status = 'dismissed', description = :d WHERE id = :id"),
            {"d": (row.description or "") + NOTE + str(kept[key]), "id": row.id},
        )
        closed += 1
    print(f"reports_pending_uq_001: dismissed {closed} duplicate pending report(s), deleted none")

    op.create_index(
        INDEX, "reports", ["reporter_id", "target_type", "target_id"], unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(INDEX, table_name="reports")
    bind = op.get_bind()
    # 이 마이그레이션이 닫은 신고(관리자가 손대지 않은 것)만 원래대로 되돌린다
    rows = bind.execute(sa.text(
        "SELECT id, description FROM reports "
        "WHERE status = 'dismissed' AND reviewed_by IS NULL AND description LIKE :p"
    ), {"p": "%[자동 종결] 같은 신고자의 중복 신고(SH-40 마이그레이션)%"}).all()
    for row in rows:
        original = strip_note(row.description)
        if original is None:  # 우리가 붙인 접미사로 끝나지 않음 — 건드리지 않는다
            continue
        bind.execute(
            sa.text("UPDATE reports SET status = 'pending', description = :d WHERE id = :id"),
            {"d": original or None, "id": row.id},
        )
