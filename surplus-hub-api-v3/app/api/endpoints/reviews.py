from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.notify import notify
from app.crud.crud_review import crud_review
from app.models.review import Review
from app.models.user import User
from app.schemas.review import ReviewCreate, ReviewResponse

router = APIRouter()


@router.post(
    "/",
    summary="Create Review",
    description="Write a review for another user after a transaction.",
)
def create_review(
    review_in: ReviewCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    # Can't review yourself
    if review_in.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot review yourself")

    # Check target user exists
    target = db.query(User).filter(User.id == review_in.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    # 같은 reviewer가 같은 material에 대해 이미 리뷰했는지 확인
    if review_in.material_id is not None:
        existing = db.query(Review).filter(
            Review.reviewer_id == current_user.id,
            Review.material_id == review_in.material_id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="이미 이 자재에 대한 리뷰를 작성했습니다")

    review = crud_review.create_review(
        db,
        reviewer_id=current_user.id,
        target_user_id=review_in.target_user_id,
        material_id=review_in.material_id,
        rating=review_in.rating,
        content=review_in.content,
    )

    # Notify the reviewed user
    notify(
        db,
        user_id=review.target_user_id,
        type="REVIEW",
        title="새 후기가 도착했어요",
        body=f"{current_user.name}님이 별점 {review.rating}점 후기를 남겼습니다.",
        reference_type="material",
        reference_id=review.material_id,
    )

    return {
        "status": "success",
        "data": {
            "id": review.id,
            "reviewerId": review.reviewer_id,
            "reviewerName": current_user.name,
            "targetUserId": review.target_user_id,
            "materialId": review.material_id,
            "rating": review.rating,
            "content": review.content,
            "createdAt": review.created_at.isoformat() if review.created_at else None,
        },
    }


@router.get(
    "/{review_id}",
    summary="Get Review Detail",
)
def get_review(
    review_id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    review = crud_review.get(db, id=review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    return {
        "status": "success",
        "data": {
            "id": review.id,
            "reviewerId": review.reviewer_id,
            "reviewerName": review.reviewer.name if review.reviewer else "Unknown",
            "targetUserId": review.target_user_id,
            "materialId": review.material_id,
            "rating": review.rating,
            "content": review.content,
            "createdAt": review.created_at.isoformat() if review.created_at else None,
        },
    }


@router.get(
    "/user/{user_id}",
    summary="Get User Reviews",
    description="Get all reviews for a specific user.",
)
def get_user_reviews(
    user_id: int,
    db: Session = Depends(deps.get_db),
    page: int = 1,
    limit: int = 20,
) -> Any:
    # Verify user exists
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    skip = (page - 1) * limit
    reviews, total = crud_review.get_user_reviews(
        db, target_user_id=user_id, skip=skip, limit=limit
    )

    total_pages = (total + limit - 1) // limit if total > 0 else 0

    data = []
    for r in reviews:
        data.append({
            "id": r.id,
            "reviewerId": r.reviewer_id,
            "reviewerName": r.reviewer.name if r.reviewer else "Unknown",
            "targetUserId": r.target_user_id,
            "materialId": r.material_id,
            "rating": r.rating,
            "content": r.content,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        })

    return {
        "status": "success",
        "data": data,
        "meta": {
            "totalCount": total,
            "page": page,
            "limit": limit,
            "hasNextPage": page < total_pages,
            "totalPages": total_pages,
            "averageRating": crud_review.get_average_rating(db, user_id=user_id),
            "mannerTemperature": target.manner_temperature,
        },
    }
