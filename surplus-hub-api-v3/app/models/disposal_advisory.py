from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


class DisposalAdvisory(Base):
    """모듈 0 처분 경로 판정 기록 (REUSE / RECYCLE / SCRAP) — 재지정 이력과 실제 등록 매물 연결."""

    __tablename__ = "disposal_advisories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(200), nullable=False)
    category = Column(String(50), nullable=True)
    condition_grade = Column(String(20), nullable=True)
    damage_level = Column(String(20), nullable=False, default="NONE")
    is_mixed_waste = Column(Boolean, nullable=False, default=False)
    recyclable_material = Column(String(50), nullable=True)

    similar_active_count = Column(Integer, nullable=False, default=0)
    similar_sold_count = Column(Integer, nullable=False, default=0)
    completed_trade_count = Column(Integer, nullable=False, default=0)

    recommended_route = Column(String(20), nullable=False)
    selected_route = Column(String(20), nullable=False)
    can_override_to_reuse = Column(Boolean, nullable=False, default=True)
    override_reason = Column(Text, nullable=True)
    reasoning = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
