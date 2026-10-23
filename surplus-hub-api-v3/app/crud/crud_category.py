from typing import List

from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.category import Category
from app.schemas.category import CategoryCreate

# 업종별 카테고리 (B2B 잉여자재 거래 — 디자인 명세 2026-03-25)
# 시드·Vision AI 프롬프트·AI 결과 정규화가 모두 이 목록을 기준으로 한다.
_CATEGORY_ICONS = {
    "조명": "lightbulb",
    "문/창호": "door_front",
    "건축자재": "construction",
    "전기": "electrical_services",
    "설비": "plumbing",
    "기타": "more_horiz",
}
TRADE_CATEGORIES = tuple(_CATEGORY_ICONS)


class CRUDCategory(CRUDBase[Category, CategoryCreate, dict]):
    def get_active(self, db: Session) -> List[Category]:
        return (
            db.query(Category)
            .filter(Category.is_active == True)
            .order_by(Category.display_order)
            .all()
        )

    def get_by_name(self, db: Session, *, name: str):
        return db.query(Category).filter(Category.name == name).first()

    def seed_categories(self, db: Session) -> List[Category]:
        """Seed default categories if none exist."""
        existing = db.query(Category).count()
        if existing > 0:
            return self.get_active(db)

        default_categories = [
            {"name": name, "icon": icon, "display_order": i}
            for i, (name, icon) in enumerate(_CATEGORY_ICONS.items(), start=1)
        ]

        categories = []
        for cat_data in default_categories:
            cat = Category(**cat_data)
            db.add(cat)
            categories.append(cat)

        db.commit()
        for cat in categories:
            db.refresh(cat)

        return categories


crud_category = CRUDCategory(Category)
