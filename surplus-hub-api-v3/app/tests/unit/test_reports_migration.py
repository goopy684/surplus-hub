"""reports_pending_uq_001 downgrade: 마지막 자동 종결 접미사 하나만 떼고, 없으면 건드리지 않는다."""

import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[3] / "alembic" / "versions" / "reports_pending_unique.py"
_spec = importlib.util.spec_from_file_location("reports_pending_unique", _path)
mig = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mig)


def test_strips_only_the_last_suffix_when_original_already_contains_note():
    original = "사용자가 붙여 넣은 문구" + mig.NOTE + "7 그리고 이어진 원문"
    assert mig.strip_note(original + mig.NOTE + "10") == original


def test_skips_rows_without_the_full_suffix():
    partial = "원문\n\n[자동 종결] 같은 신고자의 중복 신고(SH-40 마이그레이션) 손으로 고친 설명"
    assert mig.strip_note(partial) is None
    assert mig.strip_note("원문" + mig.NOTE + "10 덧붙임") is None
    assert mig.strip_note(None) is None


def test_null_description_round_trips_to_empty():
    assert mig.strip_note(mig.NOTE + "10") == ""
