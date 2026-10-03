import json
from datetime import datetime, timedelta, timezone
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api import deps
from app.core.notify import notify_many
from app.models.admin import AdminAuditLog
from app.models.notification import DeviceToken, Notification
from app.models.user import User

router = APIRouter()

_PLATFORMS = ("ios", "android", "expo", "web")


class PushBroadcast(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    body: str = Field(..., min_length=1, max_length=500)
    target: Literal["all", "users", "role"]
    user_ids: Optional[List[int]] = Field(None, alias="userIds")
    role: Optional[str] = None
    type: Literal["SYSTEM", "MARKETING"] = "SYSTEM"
    reference_type: Optional[str] = Field(None, alias="referenceType")
    reference_id: Optional[int] = Field(None, alias="referenceId")

    model_config = {"populate_by_name": True}

    @field_validator("title", "body")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be blank")
        return v.strip()

    @model_validator(mode="after")
    def _target_needs_its_selector(self):
        if self.target == "users" and not self.user_ids:
            raise ValueError("userIds is required when target is 'users'")
        if self.target == "role" and not (self.role or "").strip():
            raise ValueError("role is required when target is 'role'")
        return self


@router.post("/push", summary="Broadcast a push notification (ADMIN+)")
def broadcast_push(
    push_in: PushBroadcast,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    query = db.query(User.id).filter(User.is_active == True)  # noqa: E712
    if push_in.target == "users":
        # Unknown ids are silently dropped — `targeted` tells the admin what matched.
        query = query.filter(User.id.in_(push_in.user_ids))
    elif push_in.target == "role":
        query = query.filter(func.lower(User.role) == push_in.role.strip().lower())
    user_ids = [row[0] for row in query.all()]

    stats = notify_many(
        db,
        user_ids=user_ids,
        type=push_in.type,
        title=push_in.title,
        body=push_in.body,
        reference_type=push_in.reference_type,
        reference_id=push_in.reference_id,
    )

    # An attempted broadcast is worth recording even when nobody matched.
    db.add(
        AdminAuditLog(
            admin_id=current_user.id,
            action="PUSH_BROADCAST",
            target_type="notification",
            target_id=None,
            details=json.dumps(
                {
                    "title": push_in.title,
                    "body": push_in.body,
                    "target": push_in.target,
                    "type": push_in.type,
                    **stats,
                },
                ensure_ascii=False,
            ),
            ip_address=None,
        )
    )
    db.commit()

    return {"status": "success", "data": stats}


@router.get("/stats", summary="Notification & device token stats (MODERATOR+)")
def get_notification_stats(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    by_platform = dict(
        db.query(DeviceToken.platform, func.count(DeviceToken.id))
        .filter(DeviceToken.is_active == True)  # noqa: E712
        .group_by(DeviceToken.platform)
        .all()
    )
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    return {
        "status": "success",
        "data": {
            "totalNotifications": db.query(func.count(Notification.id)).scalar() or 0,
            "unreadNotifications": db.query(func.count(Notification.id))
            .filter(Notification.is_read == False)  # noqa: E712
            .scalar()
            or 0,
            "deviceTokens": {
                "total": db.query(func.count(DeviceToken.id)).scalar() or 0,
                "active": sum(by_platform.values()),
                **{p: by_platform.get(p, 0) for p in _PLATFORMS},
            },
            "sentLast7Days": db.query(func.count(Notification.id))
            .filter(Notification.created_at >= cutoff)
            .scalar()
            or 0,
        },
    }


@router.get("/history", summary="Push broadcast history (MODERATOR+)")
def get_push_history(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    rows = (
        db.query(AdminAuditLog, User)
        .outerjoin(User, User.id == AdminAuditLog.admin_id)
        .filter(AdminAuditLog.action == "PUSH_BROADCAST")
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .limit(limit)
        .all()
    )

    items = []
    for log, admin in rows:
        try:
            details = json.loads(log.details or "{}")
        except ValueError:
            details = {}
        if not isinstance(details, dict):
            details = {}
        items.append(
            {
                "id": log.id,
                "adminId": log.admin_id,
                "adminName": (admin.name or admin.email or "") if admin else "",
                "title": details.get("title") or "",
                "body": details.get("body") or "",
                "target": details.get("target") or "",
                "targeted": details.get("targeted") or 0,
                "createdAt": log.created_at,
            }
        )

    return {"status": "success", "data": items}
