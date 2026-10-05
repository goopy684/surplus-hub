from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_material import crud_material
from app.crud.crud_like import crud_material_like
from app.models.material import Material
from app.models.user import User
from app.schemas.material import MaterialCreate, MaterialUpdate, Material as MaterialSchema  # noqa: F401
from app.schemas.material_response import MaterialListResponse
from app.schemas.like import LikeStatusResponse


# B2: status를 query param 대신 request body로 받기 위한 스키마
class MaterialStatusUpdate(BaseModel):
    status: str
    buyer_id: Optional[int] = Field(None, alias="buyerId")

    model_config = {"populate_by_name": True}

router = APIRouter()


@router.get(
    "/",
    response_model=MaterialListResponse,
    summary="List Materials",
    description="Get a paginated list of surplus materials. Supports both offset and cursor pagination.",
)
def read_materials(
    db: Session = Depends(deps.get_db),
    page: int = 1,
    limit: int = 20,
    category: Optional[str] = None,
    keyword: Optional[str] = None,
    sort: Optional[str] = None,
    cursor: Optional[int] = None,
    condition_grade: Optional[str] = None,
    location: Optional[str] = None,
) -> Any:
    # Cursor-based pagination (for mobile infinite scroll)
    if cursor is not None or page == 0:
        items, next_cursor = crud_material.get_multi_cursor(
            db, cursor=cursor, limit=limit, category=category, keyword=keyword, sort=sort
        )
        data = [MaterialSchema.model_validate(m) for m in items]
        return {
            "status": "success",
            "data": data,
            "meta": {
                "nextCursor": next_cursor,
                "hasMore": next_cursor is not None,
                "limit": limit,
            },
        }

    # Offset-based pagination (backward compatible)
    materials, total_count = crud_material.get_multi_with_filters(
        db, page=page, limit=limit, category=category, keyword=keyword, sort=sort,
        condition_grade=condition_grade, location_address=location,
    )

    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 0
    has_next_page = page < total_pages

    data = [MaterialSchema.model_validate(m) for m in materials]

    return {
        "status": "success",
        "data": data,
        "meta": {
            "totalCount": total_count,
            "page": page,
            "limit": limit,
            "hasNextPage": has_next_page,
            "totalPages": total_pages,
        },
    }


@router.post(
    "/",
    summary="Create Material",
    description="Register a new material for sale/trade.",
)
def create_material(
    material_in: MaterialCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    db_obj = crud_material.create_with_images(
        db,
        obj_in=material_in,
        seller_id=current_user.id,
        image_urls=material_in.photo_urls,
    )

    # AI: auto-generate embedding in background (non-blocking)
    from app.ai.services.embedding_hook import update_material_embedding_background
    background_tasks.add_task(update_material_embedding_background, db_obj.id)

    return {
        "status": "success",
        "data": MaterialSchema.model_validate(db_obj),
    }


@router.get(
    "/{id}",
    summary="Get Material Detail",
    description="Get detail of a material.",
)
def read_material(
    id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    material = crud_material.get(db, id=id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    return {
        "status": "success",
        "data": MaterialSchema.model_validate(material),
    }


@router.put(
    "/{id}",
    summary="Update Material",
    description="Update a material listing. Only the owner can update.",
)
def update_material(
    id: int,
    material_in: MaterialUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    material = crud_material.get(db, id=id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if material.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this material")

    try:
        updated = crud_material.update_material(db, db_obj=material, obj_in=material_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # AI: re-generate embedding in background (non-blocking)
    from app.ai.services.embedding_hook import update_material_embedding_background
    background_tasks.add_task(update_material_embedding_background, updated.id)

    return {
        "status": "success",
        "data": MaterialSchema.model_validate(updated),
    }


@router.delete(
    "/{id}",
    summary="Delete Material",
    description="Soft-delete a material listing. Only the owner can delete.",
)
def delete_material(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    material = crud_material.get(db, id=id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if material.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this material")

    crud_material.soft_delete(db, db_obj=material)
    return {"status": "success", "data": {"message": "Material deleted"}}


@router.patch(
    "/{id}/status",
    summary="Update Material Status",
    description="Update the status of a material. Owner or admin only.",
)
def update_material_status(
    id: int,
    body: MaterialStatusUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    status = body.status
    material = crud_material.get(db, id=id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Owner or admin
    if material.seller_id != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not authorized")

    valid_statuses = {"ACTIVE", "REVIEWING", "RESERVED", "SOLD", "HIDDEN"}
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}",
        )

    try:
        updated = crud_material.update_status(db, db_obj=material, status=status, buyer_id=body.buyer_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "success",
        "data": MaterialSchema.model_validate(updated),
    }


@router.post(
    "/{id}/like",
    summary="Toggle Material Like",
    description="Like or unlike a material. Returns current like status.",
)
def toggle_material_like(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    material = crud_material.get(db, id=id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    is_liked = crud_material_like.toggle(db, user_id=current_user.id, material_id=id)
    db.refresh(material)
    return {
        "status": "success",
        "data": LikeStatusResponse(isLiked=is_liked, likesCount=material.likes_count or 0),
    }


@router.get(
    "/{id}/like",
    summary="Check Material Like Status",
    description="Check if current user has liked this material.",
)
def check_material_like(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    material = crud_material.get(db, id=id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    is_liked = crud_material_like.is_liked(db, user_id=current_user.id, material_id=id)
    return {
        "status": "success",
        "data": LikeStatusResponse(isLiked=is_liked, likesCount=material.likes_count or 0),
    }
