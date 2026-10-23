import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.stats import UserDailyActivity

logger = logging.getLogger(__name__)

KST = ZoneInfo("Asia/Seoul")

# ponytail: per-process memo so each worker writes a user at most once a day;
# the (user_id, date) PK dedupes across workers. Swap for Redis SETNX if DB writes ever matter.
_seen_day: date | None = None
_seen: set[int] = set()


def kst_today() -> date:
    return datetime.now(KST).date()


def record_activity(db: Session, user_id: int) -> None:
    """Mark user_id active today. Best-effort: a metrics write must never fail the request."""
    global _seen_day
    today = kst_today()
    if today != _seen_day:
        _seen_day = today
        _seen.clear()
    if user_id in _seen:
        return

    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    try:
        db.execute(
            insert(UserDailyActivity)
            .values(user_id=user_id, date=today)
            .on_conflict_do_nothing()
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("Failed to record activity for user %s", user_id, exc_info=True)
        return
    _seen.add(user_id)
