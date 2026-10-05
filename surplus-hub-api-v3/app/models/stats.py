from sqlalchemy import Column, Integer, String, DateTime, Date, Float, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base


class DailyStats(Base):
    __tablename__ = "daily_stats"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    new_users = Column(Integer, default=0)
    active_users = Column(Integer, default=0)
    new_materials = Column(Integer, default=0)
    new_transactions = Column(Integer, default=0)
    completed_transactions = Column(Integer, default=0)
    total_transaction_amount = Column(Float, default=0.0)
    new_reports = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserDailyActivity(Base):
    """One row per user per KST day with any authenticated request — source for DAU/WAU/MAU and retention."""
    __tablename__ = "user_daily_activity"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    date = Column(Date, primary_key=True, index=True)
