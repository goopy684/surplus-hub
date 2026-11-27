from typing import Any
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import deps
from app.ai.services import wanted as wanted_service
from app.core.cache import invalidate_material_caches
from app.core.notify import notify
from app.crud.crud_admin import crud_admin
from app.crud.crud_material import crud_material
from app.models.user import User
from app.models.wanted import WantedRequest

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
    background_tasks: BackgroundTasks,
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
    invalidate_material_caches()
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
    if review_in.action == "approve":
        wanted_service.enqueue_match(background_tasks, db, material)

    from app.schemas.material import Material as MaterialSchema
    return {
        "status": "success",
        "data": MaterialSchema.model_validate(material),
    }


@router.post(
    "/wanted/{wanted_id}/hide",
    summary="Hide Wanted Request (Admin)",
    description="Hide a wanted request from public lists and detail. MODERATOR+.",
)
def hide_wanted(
    wanted_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    wanted = db.get(WantedRequest, wanted_id)
    if not wanted:
        raise HTTPException(status_code=404, detail="Wanted request not found")
    wanted.status = "HIDDEN"
    db.commit()
    db.refresh(wanted)
    data = wanted_service.serialize_wanted(wanted, datetime.now(timezone.utc))
    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="HIDE_WANTED",
        target_type="wanted",
        target_id=wanted.id,
        ip_address=deps.get_client_ip(request),
    )
    return {"status": "success", "data": data}
