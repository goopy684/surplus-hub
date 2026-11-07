import json
from typing import Optional
from sqlalchemy.orm import Session

from app.models.admin import AdminAuditLog
from app.models.user import User


class CRUDAdmin:
    def get_admin_users(self, db: Session, *, skip: int = 0, limit: int = 100) -> list[User]:
        return (
            db.query(User)
            .filter(User.admin_role.isnot(None))
            .offset(skip)
            .limit(limit)
            .all()
        )

    def count_admin_users(self, db: Session) -> int:
        return db.query(User).filter(User.admin_role.isnot(None)).count()

    def count_super_admins(self, db: Session) -> int:
        return db.query(User).filter(User.admin_role == "SUPER_ADMIN").count()

    def get_user(self, db: Session, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()

    def update_admin_role(self, db: Session, *, user_id: int, role: Optional[str]) -> Optional[User]:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        user.admin_role = role
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def create_audit_log(
        self,
        db: Session,
        *,
        admin_id: int,
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[int] = None,
        details: Optional[dict] = None,
        ip_address: Optional[str] = None,
    ) -> AdminAuditLog:
        log = AdminAuditLog(
            admin_id=admin_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=json.dumps(details, ensure_ascii=False, default=str) if details else None,
            ip_address=ip_address,
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    def get_audit_logs(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 100,
        admin_id: Optional[int] = None,
    ) -> list[AdminAuditLog]:
        query = db.query(AdminAuditLog)
        if admin_id is not None:
            query = query.filter(AdminAuditLog.admin_id == admin_id)
        return query.order_by(AdminAuditLog.created_at.desc()).offset(skip).limit(limit).all()

    def count_audit_logs(self, db: Session, *, admin_id: Optional[int] = None) -> int:
        query = db.query(AdminAuditLog)
        if admin_id is not None:
            query = query.filter(AdminAuditLog.admin_id == admin_id)
        return query.count()


crud_admin = CRUDAdmin()
