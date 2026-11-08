"""Move legacy material categories onto the 6 업종 categories (idempotent).

Older seeds used 철근/목재/시멘트/... which the web/mobile category chips
(조명/문/창호/건축자재/전기/설비/기타) can never match.

Usage:
    python -m scripts.normalize_categories            # dry run
    python -m scripts.normalize_categories --apply
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.crud.crud_category import crud_category
from app.db.session import SessionLocal
from app.models.category import Category
from app.models.material import Material

CURRENT = {"조명", "문/창호", "건축자재", "전기", "설비", "기타"}
LEGACY = {
    "창호": "문/창호",
    "전기자재": "전기",
    "배관자재": "설비",
    **{name: "건축자재" for name in ("철근", "철물", "목재", "시멘트", "벽돌/블록", "타일", "페인트", "단열재", "벽지/바닥재")},
}


def main(apply: bool) -> None:
    db = SessionLocal()
    try:
        for old, new in [*LEGACY.items(), (None, "기타")]:
            q = db.query(Material).filter(Material.category.is_(None) if old is None else Material.category == old)
            n = q.update({Material.category: new}, synchronize_session=False)
            if n:
                print(f"materials: {old!r} -> {new!r}: {n}")

        unknown = db.query(Material.category).filter(Material.category.notin_(CURRENT)).distinct().all()
        if unknown:
            print("left as-is (unmapped):", [c for (c,) in unknown])

        stale = db.query(Category).filter(Category.name.notin_(CURRENT)).count()
        if stale:
            db.query(Category).delete(synchronize_session=False)
            print(f"categories: replaced {stale} legacy rows with the 6 defaults")

        if not apply:
            db.rollback()
            print("dry run — rerun with --apply")
            return
        db.commit()
        crud_category.seed_categories(db)  # no-op unless the table is empty
    finally:
        db.close()


if __name__ == "__main__":
    main("--apply" in sys.argv)
