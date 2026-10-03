from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.api import deps
from app.crud.crud_user import crud_user
from app.crud.crud_like import crud_material_like
from app.crud.crud_subscription import crud_subscription
from app.models.user import User
from app.schemas.user import UserUpdate
from app.schemas.material import Material as MaterialSchema
from app.schemas.subscription import SubscriptionResponse, SubscriptionVerify

router = APIRouter()

@router.get("/", summary="List Users", description="Retrieve a list of users (Admin only)")
def read_users(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_active_superuser),
) -> Any:
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.get("/me", response_model=schemas.UserResponse, summary="Get Current User", description="Get the profile information of the currently logged-in user.")
def read_user_me(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    stats_data = crud_user.get_user_stats(db, user_id=current_user.id)
    stats = schemas.user_response.UserStats(**stats_data)

    user_data = schemas.user_response.UserData(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        profileImageUrl=current_user.profile_image_url,
        location=current_user.location,
        trustLevel=current_user.trust_level,
        mannerTemperature=current_user.manner_temperature,
        stats=stats,
        isPremium=crud_subscription.is_premium(db, user_id=current_user.id),
        role=current_user.role,
        adminRole=current_user.admin_role,
        isSuperuser=current_user.is_superuser,
    )

    return {
        "status": "success",
        "data": user_data
    }

@router.get("/me/wishlist", summary="Get Wishlist", description="Get the current user's liked materials.")
def read_user_wishlist(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    page: int = 1,
    limit: int = 20,
) -> Any:
    skip = (page - 1) * limit
    materials, total = crud_material_like.get_user_wishlist(
        db, user_id=current_user.id, skip=skip, limit=limit
    )

    total_pages = (total + limit - 1) // limit if total > 0 else 0

    return {
        "status": "success",
        "data": [MaterialSchema.model_validate(m) for m in materials],
        "meta": {
            "totalCount": total,
            "page": page,
            "limit": limit,
            "hasNextPage": page < total_pages,
            "totalPages": total_pages,
        },
    }

@router.put("/me", summary="Update Profile", description="Update the current user's profile.")
def update_user_me(
    user_in: UserUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    updated_user = crud_user.update(db, db_obj=current_user, obj_in=user_in)

    stats_data = crud_user.get_user_stats(db, user_id=updated_user.id)
    stats = schemas.user_response.UserStats(**stats_data)

    user_data = schemas.user_response.UserData(
        id=str(updated_user.id),
        name=updated_user.name,
        profileImageUrl=updated_user.profile_image_url,
        location=updated_user.location,
        trustLevel=updated_user.trust_level,
        mannerTemperature=updated_user.manner_temperature,
        stats=stats,
        isPremium=crud_subscription.is_premium(db, user_id=updated_user.id),
        role=updated_user.role
    )

    return {
        "status": "success",
        "data": user_data
    }


@router.get("/me/subscription", summary="Get Subscription", description="Get the current user's subscription status.")
def get_subscription(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    sub = crud_subscription.get_active_subscription(db, user_id=current_user.id)
    if not sub:
        return {
            "status": "success",
            "data": {"plan": "free", "status": "active", "isPremium": False},
        }
    return {
        "status": "success",
        "data": {
            **SubscriptionResponse.model_validate(sub).model_dump(by_alias=True),
            "isPremium": crud_subscription.is_premium(db, user_id=current_user.id),
        },
    }


@router.post("/me/subscription/verify", summary="Verify IAP Receipt", description="Verify an IAP receipt for premium subscription.")
def verify_subscription(
    verify_in: SubscriptionVerify,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    sub = crud_subscription.verify_receipt(
        db,
        user_id=current_user.id,
        receipt_id=verify_in.receipt_id,
        platform=verify_in.platform,
    )
    return {
        "status": "success",
        "data": {
            **SubscriptionResponse.model_validate(sub).model_dump(by_alias=True),
            "isPremium": True,
        },
    }
