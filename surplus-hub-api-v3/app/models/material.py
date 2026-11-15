from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, or_
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base

try:
    from pgvector.sqlalchemy import Vector
except ImportError:
    Vector = None

class TradeMethod(str, enum.Enum):
    DIRECT = "DIRECT"
    DELIVERY = "DELIVERY"
    BOTH = "BOTH"

class MaterialStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REVIEWING = "REVIEWING"
    RESERVED = "RESERVED"
    SOLD = "SOLD"
    HIDDEN = "HIDDEN"

class ConditionGrade(str, enum.Enum):
    GOOD = "상"
    FAIR = "중"
    POOR = "하"

class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=False)
    price = Column(Integer, nullable=False)

    quantity = Column(Integer, default=1)
    quantity_unit = Column(String, default="개")

    trade_method = Column(String, default="DIRECT")

    location_address = Column(String, nullable=False)
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)

    category = Column(String, index=True)
    condition_grade = Column(String, nullable=True)

    # 거래 전 AI 진단(triage)에서 전환된 매물: 유동성 점수(고유동성 배지)와 처분 경로.
    # 경로 B/C는 메인 피드·검색에서 빠지고 track 필터로만 조회된다. NULL은 일반 매물.
    liquidity_score = Column(Integer, nullable=True)
    disposition_path = Column(String, nullable=True)

    status = Column(String, default="ACTIVE")
    likes_count = Column(Integer, default=0)

    seller_id = Column(Integer, ForeignKey("users.id"))
    seller = relationship("User", foreign_keys=[seller_id], backref="materials")

    material_images = relationship(
        "MaterialImage", back_populates="material",
        order_by="MaterialImage.display_order",
        cascade="all, delete-orphan"
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # AI embedding
    embedding_vector = Column(Vector(1024), nullable=True) if Vector else None

    # Admin review
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    review_note = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewer = relationship("User", foreign_keys=[reviewed_by])

    @property
    def location(self):
        return {
            "address": self.location_address,
            "lat": self.location_lat,
            "lng": self.location_lng
        }

    @property
    def images(self):
        return [img.url for img in self.material_images] if self.material_images else []

    @property
    def thumbnail_url(self):
        if self.material_images:
            return self.material_images[0].url
        return None

    def __str__(self) -> str:
        return f"{self.title} (#{self.id})"


# 공개 피드·검색에 노출되는 매물: 처분 경로 B/C(소재 매입·중량 처분)가 아닌 것 (NULL 포함)
PUBLIC_TRACK_FILTER = or_(
    Material.disposition_path.is_(None),
    Material.disposition_path.notin_(("B", "C")),
)
