from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, and_
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class WantedRequest(Base):
    """구매 요청(구해요/RFQ). 열린 요청은 매칭 알림과 급구 전광판·진단 수요 점수의 명시적 수요가 된다."""

    __tablename__ = "wanted_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False, index=True)
    quantity = Column(Integer, nullable=True)
    quantity_unit = Column(String, nullable=True)
    budget_max = Column(Integer, nullable=True)

    location_address = Column(String, nullable=False)
    location_lat = Column(Float, nullable=False)
    location_lng = Column(Float, nullable=False)
    radius_km = Column(Integer, nullable=False, default=30)

    # OPEN / CLOSED / HIDDEN(관리자). 만료는 저장하지 않는다 — 스케줄러 없이 조회 시 expires_at으로 거른다
    status = Column(String, nullable=False, default="OPEN", index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_notified_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")


def open_wanted(now):
    """공개 목록·매칭·수요 집계 대상: OPEN이고 아직 만료되지 않은 요청."""
    return and_(WantedRequest.status == "OPEN", WantedRequest.expires_at > now)
