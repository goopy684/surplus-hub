from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_admin import crud_admin
from app.models.user import User
from app.schemas.admin import (
    AdminRoleUpdate,
    AuditLogResponse,
    AdminUserResponse,
    AdminRoleListResponse,
)
from app.core.permissions import ROLE_HIERARCHY

router = APIRouter()


@router.get("", summary="List admin users")
def list_admin_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    users = crud_admin.get_admin_users(db, skip=skip, limit=limit)
    total = crud_admin.count_admin_users(db)
    items = [AdminUserResponse.model_validate(u) for u in users]
    return {"status": "success", "data": AdminRoleListResponse(items=items, total=total)}


@router.get("/audit-logs", summary="View audit logs")
def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    admin_id: Optional[int] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    logs = crud_admin.get_audit_logs(db, skip=skip, limit=limit, admin_id=admin_id)
    total = crud_admin.count_audit_logs(db, admin_id=admin_id)
    items = [AuditLogResponse.model_validate(log) for log in logs]
    return {"status": "success", "data": {"items": items, "total": total}}


@router.get("/{user_id}", summary="Get admin user detail")
def get_admin_user(
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    user = crud_admin.get_user(db, user_id=user_id)
    if not user or user.admin_role is None:
        raise HTTPException(status_code=404, detail="Admin user not found")
    return {"status": "success", "data": AdminUserResponse.model_validate(user)}


@router.put("/{user_id}/role", summary="Update user admin role (SUPER_ADMIN only)")
def update_admin_role(
    user_id: int,
    role_in: AdminRoleUpdate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("SUPER_ADMIN")),
) -> Any:
    new_role = role_in.admin_role if role_in.admin_role else None

    if new_role and new_role not in ROLE_HIERARCHY:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Must be one of: {', '.join(ROLE_HIERARCHY.keys())}",
        )

    user = crud_admin.get_user(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_role = user.admin_role

    # C2: Prevent last SUPER_ADMIN from losing their role
    if old_role == "SUPER_ADMIN" and new_role != "SUPER_ADMIN":
        super_admin_count = crud_admin.count_super_admins(db)
        if super_admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove the last SUPER_ADMIN role",
            )

    updated_user = crud_admin.update_admin_role(db, user_id=user_id, role=new_role)

    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="UPDATE_ADMIN_ROLE",
        target_type="user",
        target_id=user_id,
        details={"old_role": old_role, "new_role": new_role},
        ip_address=deps.get_client_ip(request),
    )

    return {"status": "success", "data": AdminUserResponse.model_validate(updated_user)}
