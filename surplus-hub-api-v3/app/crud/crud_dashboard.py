import csv
import io
from datetime import datetime, time, timedelta, date, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.activity import KST, kst_today
from app.models.user import User
from app.models.material import Material
from app.models.stats import UserDailyActivity
from app.models.transaction import Transaction


class CRUDDashboard:

    def get_summary(self, db: Session) -> dict:
        """Get KPI summary by querying actual tables."""
        today = kst_today()
        today_start = datetime.combine(today, time.min, tzinfo=KST)  # "오늘" = KST day, same as DAU

        total_users = db.query(func.count(User.id)).scalar() or 0
        new_users_today = (
            db.query(func.count(User.id))
            .filter(User.created_at >= today_start)
            .scalar()
        ) or 0

        total_materials = db.query(func.count(Material.id)).scalar() or 0
        active_materials = (
            db.query(func.count(Material.id))
            .filter(Material.status == "ACTIVE")
            .scalar()
        ) or 0

        total_transactions = db.query(func.count(Transaction.id)).scalar() or 0
        completed_transactions = (
            db.query(func.count(Transaction.id))
            .filter(Transaction.status == "COMPLETED")
            .scalar()
        ) or 0
        completed_amount = (
            db.query(func.sum(Transaction.price))
            .filter(Transaction.status == "COMPLETED")
            .scalar()
        ) or 0

        pending_reports = 0
        try:
            from app.models.moderation import Report
            pending_reports = (
                db.query(func.count(Report.id))
                .filter(Report.status == "pending")
                .scalar()
            ) or 0
        except Exception:
            pass

        return {
            "totalUsers": total_users,
            "dau": self._active_users_between(db, today, today),
            "wau": self._active_users_between(db, today - timedelta(days=6), today),
            "mau": self._active_users_between(db, today - timedelta(days=29), today),
            "newUsersToday": new_users_today,
            "totalMaterials": total_materials,
            "activeMaterials": active_materials,
            "totalTransactions": total_transactions,
            "completedTransactions": completed_transactions,
            "completedTransactionAmount": completed_amount,
            "pendingReports": pending_reports,
        }

    @staticmethod
    def _active_users_between(db: Session, start: date, end: date) -> int:
        return (
            db.query(func.count(func.distinct(UserDailyActivity.user_id)))
            .filter(UserDailyActivity.date >= start, UserDailyActivity.date <= end)
            .scalar()
        ) or 0

    @staticmethod
    def _bucket_key(d: date, period: str) -> date:
        if period == "week":
            return d - timedelta(days=d.weekday())  # Monday of that ISO week
        if period == "month":
            return d.replace(day=1)
        return d

    @staticmethod
    def _bucket_rows(rows, period: str) -> list[dict]:
        """Roll daily (date, count) rows up into day/week/month buckets.

        SQL always groups by calendar day (portable across the SQLite test DB
        and Postgres prod); week/month aggregation happens here in Python so no
        dialect-specific date_trunc is needed. Row count is bounded by days<=365.
        """
        buckets: dict[str, int] = {}
        for r in rows:
            d = date.fromisoformat(str(r.date)[:10])
            bk = CRUDDashboard._bucket_key(d, period).isoformat()
            buckets[bk] = buckets.get(bk, 0) + r.count
        return [{"date": k, "count": buckets[k]} for k in sorted(buckets)]

    def get_user_stats(self, db: Session, period: str, days: int = 30) -> list[dict]:
        """User registration trends grouped by day/week/month."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        rows = (
            db.query(
                func.date(User.created_at).label("date"),
                func.count(User.id).label("count"),
            )
            .filter(User.created_at >= cutoff)
            .group_by(func.date(User.created_at))
            .order_by(func.date(User.created_at))
            .all()
        )

        return self._bucket_rows(rows, period)

    def get_material_stats(self, db: Session, period: str, days: int = 30) -> list[dict]:
        """Material listing trends grouped by day/week/month."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        rows = (
            db.query(
                func.date(Material.created_at).label("date"),
                func.count(Material.id).label("count"),
            )
            .filter(Material.created_at >= cutoff)
            .group_by(func.date(Material.created_at))
            .order_by(func.date(Material.created_at))
            .all()
        )

        return self._bucket_rows(rows, period)

    def get_transaction_stats(self, db: Session, period: str, days: int = 30) -> list[dict]:
        """Transaction trends grouped by day/week/month."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        rows = (
            db.query(
                func.date(Transaction.created_at).label("date"),
                func.count(Transaction.id).label("count"),
            )
            .filter(Transaction.created_at >= cutoff)
            .group_by(func.date(Transaction.created_at))
            .order_by(func.date(Transaction.created_at))
            .all()
        )

        return self._bucket_rows(rows, period)

    def get_active_user_stats(self, db: Session, period: str, days: int = 30) -> list[dict]:
        """Distinct active users per day/week/month bucket (KST days).

        Unlike the other trends this can't sum daily rows — one user active on
        three days of a week is still one weekly active user — so week/month
        buckets each run their own COUNT(DISTINCT).
        """
        today = kst_today()
        start = today - timedelta(days=days - 1)
        if period == "day":
            rows = (
                db.query(UserDailyActivity.date, func.count(UserDailyActivity.user_id))
                .filter(UserDailyActivity.date >= start)
                .group_by(UserDailyActivity.date)
                .order_by(UserDailyActivity.date)
                .all()
            )
            return [{"date": str(d)[:10], "count": c} for d, c in rows]

        # ponytail: one query per bucket (<=53 weeks / 13 months at days<=365); fold into SQL if it ever shows up in latency.
        result = []
        key = self._bucket_key(start, period)
        while key <= today:
            nxt = self._bucket_key(key + timedelta(days=7 if period == "week" else 32), period)
            count = self._active_users_between(db, max(key, start), nxt - timedelta(days=1))
            if count:
                result.append({"date": key.isoformat(), "count": count})
            key = nxt
        return result

    def export_csv(
        self,
        db: Session,
        export_type: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> str:
        """Generate CSV string for export."""
        output = io.StringIO()
        writer = csv.writer(output)

        sd = datetime.fromisoformat(start_date) if start_date else None
        ed = datetime.fromisoformat(end_date) if end_date else None

        if export_type == "users":
            writer.writerow(["id", "email", "name", "role", "is_active", "created_at"])
            query = db.query(User)
            if sd:
                query = query.filter(User.created_at >= sd)
            if ed:
                query = query.filter(User.created_at <= ed)
            for u in query.all():
                writer.writerow([u.id, u.email, u.name, u.role, u.is_active, u.created_at])

        elif export_type == "materials":
            writer.writerow(["id", "title", "price", "status", "category", "seller_id", "created_at"])
            query = db.query(Material)
            if sd:
                query = query.filter(Material.created_at >= sd)
            if ed:
                query = query.filter(Material.created_at <= ed)
            for m in query.all():
                writer.writerow([m.id, m.title, m.price, m.status, m.category, m.seller_id, m.created_at])

        elif export_type == "transactions":
            writer.writerow(["id", "material_id", "seller_id", "buyer_id", "price", "status", "created_at"])
            query = db.query(Transaction)
            if sd:
                query = query.filter(Transaction.created_at >= sd)
            if ed:
                query = query.filter(Transaction.created_at <= ed)
            for t in query.all():
                writer.writerow([t.id, t.material_id, t.seller_id, t.buyer_id, t.price, t.status, t.created_at])

        return output.getvalue()


crud_dashboard = CRUDDashboard()
