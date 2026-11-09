from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base import Base


class Report(Base):
    __tablename__ = "reports"
    # 같은 사용자가 같은 대상을 반복 신고하지 못하게 한다 (SH-40)
    __table_args__ = (
        UniqueConstraint("reporter_id", "target_type", "target_id", name="uq_report_reporter_target"),
    )

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    target_type = Column(String, nullable=False)  # "user", "material", "post", "comment"
    target_id = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)  # "spam", "abuse", "fraud", "inappropriate", "other"
    description = Column(Text, nullable=True)
    status = Column(String, default="pending")  # "pending", "reviewed", "resolved", "dismissed"
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    reporter = relationship("User", foreign_keys=[reporter_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])


class UserSanction(Base):
    __tablename__ = "user_sanctions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sanction_type = Column(String, nullable=False)  # "WARNING", "SUSPENSION", "BAN"
    reason = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)  # null = permanent
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])
    admin = relationship("User", foreign_keys=[admin_id])


class AdminNote(Base):
    __tablename__ = "admin_notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    admin = relationship("User", foreign_keys=[admin_id])


class BannedWord(Base):
    __tablename__ = "banned_words"

    id = Column(Integer, primary_key=True, index=True)
    word = Column(String, nullable=False, unique=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
