from typing import Any
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import deps
from app.core.notify import notify
from app.crud.crud_admin import crud_admin
from app.crud.crud_material import crud_material
from app.models.user import User

router = APIRouter()


class ReviewAction(BaseModel):
    action: str  # approve, reject
    note: str = ""


@router.patch(
    "/materials/{material_id}/review",
    summary="Review Material (Admin)",
    description="Approve or reject a material listing. Admin only.",
)
def review_material(
    material_id: int,
    review_in: ReviewAction,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_superuser),
) -> Any:
    material = crud_material.get(db, id=material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    if review_in.action == "approve":
        material.status = "ACTIVE"
    elif review_in.action == "reject":
        material.status = "HIDDEN"
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'approve' or 'reject'.")
    
    material.reviewed_by = current_user.id
    material.review_note = review_in.note
    material.reviewed_at = datetime.now(timezone.utc)
    
    db.add(material)
    db.commit()
    db.refresh(material)
    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="REVIEW_MATERIAL",
        target_type="material",
        target_id=material.id,
        details={"action": review_in.action, "note": review_in.note},
        ip_address=deps.get_client_ip(request),
    )

    # Notify the seller of the review outcome
    if review_in.action == "approve":
        title, body = "자재 등록이 승인되었습니다", f"'{material.title}' 등록이 승인되어 게시되었습니다."
    else:
        title = "자재 등록이 반려되었습니다"
        body = f"'{material.title}' 등록이 반려되었습니다."
        if review_in.note:
            body += f" 사유: {review_in.note}"
    notify(
        db,
        user_id=material.seller_id,
        type="MATERIAL_STATUS",
        title=title,
        body=body,
        reference_type="material",
        reference_id=material.id,
    )

    from app.schemas.material import Material as MaterialSchema
    return {
        "status": "success",
        "data": MaterialSchema.model_validate(material),
    }
