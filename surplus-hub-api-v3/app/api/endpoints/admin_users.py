from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_admin import crud_admin
from app.crud.crud_moderation import crud_moderation
from app.models.user import User
from app.schemas.moderation import SanctionCreate, SanctionResponse, AdminNoteCreate, AdminNoteResponse
from app.schemas.admin import AdminUserResponse

router = APIRouter()


@router.get("", summary="List users (MODERATOR+)")
def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None, alias="isActive"),
    admin_role: Optional[str] = Query(None, alias="adminRole"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    users, total = crud_moderation.get_users(
        db,
        skip=skip,
        limit=limit,
        search=search,
        is_active=is_active,
        admin_role=admin_role,
    )
    items = [AdminUserResponse.model_validate(u) for u in users]
    return {"status": "success", "data": {"items": items, "total": total}}


@router.get("/{user_id}", summary="Get user detail (MODERATOR+)")
def get_user_detail(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    user = crud_moderation.get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sanctions = crud_moderation.get_sanctions(db, user_id=user_id)
    notes = crud_moderation.get_admin_notes(db, user_id=user_id)

    user_data = AdminUserResponse.model_validate(user).model_dump(by_alias=True)
    user_data["sanctions"] = [SanctionResponse.model_validate(s).model_dump(by_alias=True) for s in sanctions]
    user_data["adminNotes"] = [AdminNoteResponse.model_validate(n).model_dump(by_alias=True) for n in notes]

    return {"status": "success", "data": user_data}


@router.post("/{user_id}/sanctions", summary="Create sanction (MODERATOR+, BAN requires ADMIN+)", status_code=201)
def create_sanction(
    user_id: int,
    data: SanctionCreate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    user = crud_moderation.get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    valid_types = {"WARNING", "SUSPENSION", "BAN"}
    if data.sanction_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid sanction_type. Must be one of: {', '.join(valid_types)}",
        )

    try:
        sanction = crud_moderation.create_sanction(
            db,
            user_id=user_id,
            admin_id=current_user.id,
            # get_current_admin_user lets superusers through without an admin_role.
            admin_role="SUPER_ADMIN" if current_user.is_superuser else current_user.admin_role,
            data=data,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="CREATE_SANCTION",
        target_type="user",
        target_id=user_id,
        details={
            "sanctionId": sanction.id,
            "sanctionType": sanction.sanction_type,
            "reason": sanction.reason,
            "expiresAt": sanction.expires_at,
        },
        ip_address=deps.get_client_ip(request),
    )
    return {"status": "success", "data": SanctionResponse.model_validate(sanction)}


@router.delete("/{user_id}/sanctions/{sanction_id}", summary="Deactivate sanction (ADMIN+)")
def deactivate_sanction(
    user_id: int,
    sanction_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    sanction = crud_moderation.get_sanction(db, sanction_id=sanction_id)
    if not sanction or sanction.user_id != user_id:
        raise HTTPException(status_code=404, detail="Sanction not found")

    updated = crud_moderation.deactivate_sanction(db, sanction_id=sanction_id)
    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="DEACTIVATE_SANCTION",
        target_type="user",
        target_id=user_id,
        details={"sanctionId": sanction_id, "sanctionType": updated.sanction_type},
        ip_address=deps.get_client_ip(request),
    )
    return {"status": "success", "data": SanctionResponse.model_validate(updated)}


@router.post("/{user_id}/notes", summary="Add admin note (MODERATOR+)", status_code=201)
def create_admin_note(
    user_id: int,
    data: AdminNoteCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    user = crud_moderation.get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    note = crud_moderation.create_admin_note(
        db, user_id=user_id, admin_id=current_user.id, content=data.content
    )
    return {"status": "success", "data": AdminNoteResponse.model_validate(note)}


@router.get("/{user_id}/notes", summary="Get admin notes (MODERATOR+)")
def get_admin_notes(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    user = crud_moderation.get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    notes = crud_moderation.get_admin_notes(db, user_id=user_id)
    items = [AdminNoteResponse.model_validate(n) for n in notes]
    return {"status": "success", "data": {"items": items, "total": len(items)}}
