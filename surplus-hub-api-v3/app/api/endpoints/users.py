from typing import Any, Optional
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
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


class BusinessVerifyRequest(BaseModel):
    business_number: str = Field(..., alias="businessNumber")
    company_name: Optional[str] = Field(None, alias="companyName")

    model_config = {"populate_by_name": True}


def validate_korean_business_number(raw: str) -> str:
    """Validate 10-digit Korean Business Registration Number (사업자등록번호) checksum."""
    digits = re.sub(r"[\s-]", "", raw or "")
    if len(digits) != 10 or not digits.isdigit() or digits.startswith("000"):
        raise ValueError("유효하지 않은 사업자등록번호 형식입니다. (10자리 숫자 필요)")

    weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
    nums = [int(c) for c in digits]
    checksum = sum(nums[i] * weights[i] for i in range(9))
    checksum += (nums[8] * 5) // 10
    expected_check_digit = (10 - (checksum % 10)) % 10

    if nums[9] != expected_check_digit:
        raise ValueError("사업자등록번호 진위 확인(체크섬)에 실패했습니다. 번호를 다시 확인해주세요.")

    return f"{digits[:3]}-{digits[3:5]}-{digits[5:]}"

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


@router.post(
    "/me/verify-business",
    summary="Verify Korean Business Registration Number",
    description="Validate a 10-digit Korean business registration number (사업자등록번호) and grant B2B verified seller status (trustLevel >= 85).",
)
def verify_business(
    verify_in: BusinessVerifyRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    try:
        formatted_number = validate_korean_business_number(verify_in.business_number)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    already_verified = (current_user.trust_level or 0) >= 80
    current_user.trust_level = max(current_user.trust_level or 1, 85)
    if not already_verified:
        current_user.manner_temperature = round(
            min(99.0, (current_user.manner_temperature or 36.5) + 1.5), 1
        )
    if verify_in.company_name and verify_in.company_name.strip():
        current_user.name = verify_in.company_name.strip()

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

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
        "data": {
            **user_data.model_dump(),
            "businessNumber": formatted_number,
            "isBusinessVerified": True,
        },
    }
