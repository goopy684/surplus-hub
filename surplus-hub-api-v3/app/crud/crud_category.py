from typing import List

from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.category import Category
from app.schemas.category import CategoryCreate


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

        # 업종별 카테고리 (B2B 잉여자재 거래 — 디자인 명세 2026-03-25)
        # 조명 / 문창호 / 건축자재 / 전기 / 설비 / 기타
        default_categories = [
            {"name": "조명", "icon": "lightbulb", "display_order": 1},
            {"name": "문/창호", "icon": "door_front", "display_order": 2},
            {"name": "건축자재", "icon": "construction", "display_order": 3},
            {"name": "전기", "icon": "electrical_services", "display_order": 4},
            {"name": "설비", "icon": "plumbing", "display_order": 5},
            {"name": "기타", "icon": "more_horiz", "display_order": 6},
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
