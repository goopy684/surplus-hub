from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


class AiTriageDiagnosis(Base):
    """거래 전 AI 유동성 진단 결과. 보관함·공유 리포트·퍼널 지표의 단일 원천."""

    __tablename__ = "ai_triage_diagnoses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # DIAGNOSED / VAULT_SAVED / LISTED_MATERIAL
    status = Column(String, nullable=False, default="DIAGNOSED", index=True)

    title = Column(String, nullable=False)
    category = Column(String, nullable=True)
    material_key = Column(String, nullable=True)
    condition_grade = Column(String, nullable=True)
    spec_text = Column(Text, nullable=True)
    image_urls = Column(JSON, nullable=True)

    quantity = Column(Integer, nullable=True)
    quantity_unit = Column(String, nullable=True)
    weight_kg = Column(Float, nullable=True)
    weight_estimated = Column(Boolean, default=False)

    location_address = Column(String, nullable=True)
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)

    liquidity_score = Column(Integer, nullable=False)
    initial_score = Column(Integer, nullable=False)
    last_notified_score = Column(Integer, nullable=True)
    match_probability = Column(Integer, nullable=True)
    expected_days = Column(Integer, nullable=True)
    score_breakdown = Column(JSON, nullable=True)
    cold_start = Column(Boolean, default=False)
    analysis_mode = Column(String, nullable=True)
    # AI 판정 경로 (A / B / C). 판매자 재지정 값은 매물 행에만 쓴다.
    disposition_path = Column(String, nullable=True, index=True)

    loss_mixed_waste = Column(Integer, nullable=True)
    scrap_value = Column(Integer, nullable=True)
    direct_sale_price = Column(Integer, nullable=True)
    net_benefit = Column(Integer, nullable=True)
    price_basis = Column(String, nullable=True)

    share_token = Column(String, nullable=False, unique=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id", ondelete="SET NULL"), nullable=True)

    vault_saved_at = Column(DateTime(timezone=True), nullable=True)
    listed_at = Column(DateTime(timezone=True), nullable=True)
    notified_at = Column(DateTime(timezone=True), nullable=True)
    reopened_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
