from typing import List, Optional

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.review import Review
from app.models.user import User
from app.schemas.review import ReviewCreate


BASE_MANNER_TEMPERATURE = 36.5
# 후기 몇 건 분량만큼 기본값(36.5) 쪽으로 당길지. 클수록 적은 후기로는 온도가 덜 움직인다.
MANNER_PRIOR_WEIGHT = 10


def manner_temperature(avg_rating: float, review_count: int) -> float:
    """평균 별점을 온도로 바꾸되 표본 수가 적으면 기본값 쪽으로 수축(베이지안 평균).

    원시 매핑: 1점 -> 10, 3점 -> 50, 5점 -> 90 (선형).
    5점 후기 1건이면 90이 아니라 (10*36.5 + 1*90) / 11 = 41.4.
    """
    raw = (avg_rating - 1) / 4 * 80 + 10
    blended = (
        MANNER_PRIOR_WEIGHT * BASE_MANNER_TEMPERATURE + review_count * raw
    ) / (MANNER_PRIOR_WEIGHT + review_count)
    return round(blended, 1)


class CRUDReview(CRUDBase[Review, ReviewCreate, dict]):
    def create_review(
        self,
        db: Session,
        *,
        reviewer_id: int,
        target_user_id: int,
        material_id: Optional[int],
        rating: int,
        content: Optional[str],
    ) -> Review:
        db_obj = Review(
            reviewer_id=reviewer_id,
            target_user_id=target_user_id,
            material_id=material_id,
            rating=rating,
            content=content,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)

        # Update target user's manner temperature
        self._update_manner_temperature(db, target_user_id)

        return db_obj

    def get_user_reviews(
        self, db: Session, *, target_user_id: int, skip: int = 0, limit: int = 20
    ) -> tuple[List[Review], int]:
        query = db.query(Review).filter(
            Review.target_user_id == target_user_id
        ).order_by(desc(Review.created_at))

        total = query.count()
        items = query.offset(skip).limit(limit).all()
        return items, total

    def get_review_count(self, db: Session, *, user_id: int) -> int:
        return db.query(Review).filter(
            Review.target_user_id == user_id
        ).count()

    def get_average_rating(self, db: Session, *, user_id: int) -> Optional[float]:
        result = db.query(func.avg(Review.rating)).filter(
            Review.target_user_id == user_id
        ).scalar()
        return float(result) if result else None

    def _update_manner_temperature(self, db: Session, user_id: int):
        count, avg_rating = db.query(func.count(Review.id), func.avg(Review.rating)).filter(
            Review.target_user_id == user_id
        ).one()
        if not count:
            return

        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.manner_temperature = manner_temperature(float(avg_rating), count)
            db.commit()


crud_review = CRUDReview(Review)
