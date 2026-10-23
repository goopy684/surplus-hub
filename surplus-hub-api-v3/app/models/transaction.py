from sqlalchemy import Boolean, Column, Integer, String, Float, ForeignKey, DateTime, Text, false
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    price = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=True)  # 구매 수량. None = 레거시 전체 구매
    # 매물이 판매중으로 남은 일부 수량 판매. 재판매(SOLD→ACTIVE) 시 취소 대상에서 제외한다.
    is_partial = Column(Boolean, nullable=False, default=False, server_default=false())
    status = Column(String, default="PENDING")  # PENDING, CONFIRMED, COMPLETED, CANCELLED

    note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    material = relationship("Material")
    seller = relationship("User", foreign_keys=[seller_id])
    buyer = relationship("User", foreign_keys=[buyer_id])
