from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models.moderation import Report, UserSanction, AdminNote, BannedWord
from app.models.user import User
from app.models.transaction import Transaction
from app.models.material import Material
from app.schemas.moderation import (
    ReportCreate,
    SanctionCreate,
    AdminNoteCreate,
    BannedWordCreate,
)
from app.core.permissions import ROLE_HIERARCHY


class CRUDModeration:
    # ------------------------------------------------------------------
    # Reports
    # ------------------------------------------------------------------

    def create_report(self, db: Session, *, reporter_id: int, data: ReportCreate) -> Report:
        report = Report(
            reporter_id=reporter_id,
            target_type=data.target_type,
            target_id=data.target_id,
            reason=data.reason,
            description=data.description,
            status="pending",
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        return report

    def get_reports(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 50,
        status_filter: Optional[str] = None,
    ) -> tuple[list[Report], int]:
        query = db.query(Report)
        if status_filter:
            query = query.filter(Report.status == status_filter)
        total = query.count()
        items = query.order_by(Report.created_at.desc()).offset(skip).limit(limit).all()
        return items, total

    def get_report(self, db: Session, report_id: int) -> Optional[Report]:
        return db.query(Report).filter(Report.id == report_id).first()

    def update_report_status(
        self,
        db: Session,
        *,
        report_id: int,
        status: str,
        reviewed_by: int,
    ) -> Optional[Report]:
        report = db.query(Report).filter(Report.id == report_id).first()
        if not report:
            return None
        report.status = status
        report.reviewed_by = reviewed_by
        report.reviewed_at = datetime.now(timezone.utc)
        db.add(report)
        db.commit()
        db.refresh(report)
        return report

    # ------------------------------------------------------------------
    # Sanctions
    # ------------------------------------------------------------------

    def create_sanction(
        self,
        db: Session,
        *,
        user_id: int,
        admin_id: int,
        admin_role: Optional[str],
        data: SanctionCreate,
    ) -> UserSanction:
        # BAN requires ADMIN+ privilege
        if data.sanction_type == "BAN":
            if ROLE_HIERARCHY.get(admin_role or "", 0) < ROLE_HIERARCHY.get("ADMIN", 0):
                raise PermissionError("BAN requires ADMIN or higher privileges")

        sanction = UserSanction(
            user_id=user_id,
            admin_id=admin_id,
            sanction_type=data.sanction_type,
            reason=data.reason,
            expires_at=data.expires_at,
            is_active=True,
        )
        db.add(sanction)

        if data.sanction_type == "BAN":
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.is_active = False
                db.add(user)

            # H10: Cancel active transactions involving the banned user
            active_transactions = (
                db.query(Transaction)
                .filter(
                    (Transaction.seller_id == user_id) | (Transaction.buyer_id == user_id),
                    Transaction.status.in_(["PENDING", "CONFIRMED"]),
                )
                .all()
            )
            for txn in active_transactions:
                txn.status = "CANCELLED"
                db.add(txn)
                # H10: release the material the cancelled transaction had locked,
                # otherwise a RESERVED listing stays dead stock forever.
                material = (
                    db.query(Material).filter(Material.id == txn.material_id).first()
                )
                if material and material.status == "RESERVED":
                    material.status = "ACTIVE"
                    db.add(material)

        db.commit()
        db.refresh(sanction)
        return sanction

    def get_sanctions(self, db: Session, *, user_id: int) -> list[UserSanction]:
        return (
            db.query(UserSanction)
            .filter(UserSanction.user_id == user_id)
            .order_by(UserSanction.created_at.desc())
            .all()
        )

    def get_sanction(self, db: Session, sanction_id: int) -> Optional[UserSanction]:
        return db.query(UserSanction).filter(UserSanction.id == sanction_id).first()

    def deactivate_sanction(self, db: Session, *, sanction_id: int) -> Optional[UserSanction]:
        sanction = db.query(UserSanction).filter(UserSanction.id == sanction_id).first()
        if not sanction:
            return None
        sanction.is_active = False
        db.add(sanction)

        # C3: Only reactivate user if no other active BAN remains
        if sanction.sanction_type == "BAN":
            other_active_bans = (
                db.query(UserSanction)
                .filter(
                    UserSanction.user_id == sanction.user_id,
                    UserSanction.id != sanction_id,
                    UserSanction.sanction_type == "BAN",
                    UserSanction.is_active == True,  # noqa: E712
                )
                .count()
            )
            if other_active_bans == 0:
                user = db.query(User).filter(User.id == sanction.user_id).first()
                if user:
                    user.is_active = True
                    db.add(user)

        db.commit()
        db.refresh(sanction)
        return sanction

    # ------------------------------------------------------------------
    # Admin Notes
    # ------------------------------------------------------------------

    def create_admin_note(
        self,
        db: Session,
        *,
        user_id: int,
        admin_id: int,
        content: str,
    ) -> AdminNote:
        note = AdminNote(user_id=user_id, admin_id=admin_id, content=content)
        db.add(note)
        db.commit()
        db.refresh(note)
        return note

    def get_admin_notes(self, db: Session, *, user_id: int) -> list[AdminNote]:
        return (
            db.query(AdminNote)
            .filter(AdminNote.user_id == user_id)
            .order_by(AdminNote.created_at.desc())
            .all()
        )

    # ------------------------------------------------------------------
    # Banned Words
    # ------------------------------------------------------------------

    def get_banned_words(self, db: Session) -> list[BannedWord]:
        return db.query(BannedWord).filter(BannedWord.is_active == True).all()  # noqa: E712

    def create_banned_word(
        self, db: Session, *, word: str, created_by: Optional[int]
    ) -> BannedWord:
        bw = BannedWord(word=word.lower().strip(), created_by=created_by)
        db.add(bw)
        db.commit()
        db.refresh(bw)
        return bw

    def delete_banned_word(self, db: Session, *, word_id: int) -> Optional[BannedWord]:
        bw = db.query(BannedWord).filter(BannedWord.id == word_id).first()
        if not bw:
            return None
        bw.is_active = False
        db.add(bw)
        db.commit()
        db.refresh(bw)
        return bw

    def check_banned_words(self, db: Session, *, text: str) -> list[str]:
        words = self.get_banned_words(db)
        text_lower = text.lower()
        return [bw.word for bw in words if bw.word in text_lower]

    # ------------------------------------------------------------------
    # Moderation Queue
    # ------------------------------------------------------------------

    def get_moderation_queue(
        self, db: Session, *, skip: int = 0, limit: int = 50
    ) -> list[dict]:
        pending_reports, _ = self.get_reports(db, skip=skip, limit=limit, status_filter="pending")
        queue = []
        for r in pending_reports:
            queue.append(
                {
                    "id": r.id,
                    "item_type": "report",
                    "target_type": r.target_type,
                    "target_id": r.target_id,
                    "reason": r.reason,
                    "status": r.status,
                    "created_at": r.created_at,
                }
            )
        return queue

    # ------------------------------------------------------------------
    # Bulk Process
    # ------------------------------------------------------------------

    def bulk_process(
        self,
        db: Session,
        *,
        ids: list[int],
        action: str,
        admin_id: int,
    ) -> int:
        """Bulk update report statuses. Returns count of processed items."""
        valid_actions = {"dismiss": "dismissed", "resolve": "resolved", "review": "reviewed"}
        if action not in valid_actions:
            raise ValueError(f"Invalid action: {action}. Must be one of {list(valid_actions)}")

        new_status = valid_actions[action]
        now = datetime.now(timezone.utc)
        count = 0
        for report_id in ids:
            report = db.query(Report).filter(Report.id == report_id).first()
            if report and report.status == "pending":
                report.status = new_status
                report.reviewed_by = admin_id
                report.reviewed_at = now
                db.add(report)
                count += 1
        db.commit()
        return count

    # ------------------------------------------------------------------
    # User listing helpers
    # ------------------------------------------------------------------

    def get_users(
        self,
        db: Session,
        *,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None,
        is_active: Optional[bool] = None,
        admin_role: Optional[str] = None,
    ) -> tuple[list[User], int]:
        query = db.query(User)
        if search:
            query = query.filter(
                (User.name.ilike(f"%{search}%")) | (User.email.ilike(f"%{search}%"))
            )
        if is_active is not None:
            query = query.filter(User.is_active == is_active)
        if admin_role is not None:
            query = query.filter(User.admin_role == admin_role)
        total = query.count()
        items = query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
        return items, total

    def get_user(self, db: Session, *, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()


crud_moderation = CRUDModeration()
