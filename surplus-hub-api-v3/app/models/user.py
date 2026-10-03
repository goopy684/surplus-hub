from sqlalchemy import Boolean, Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    clerk_id = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    name = Column(String, index=True)
    profile_image_url = Column(String, nullable=True)
    location = Column(String, nullable=True)
    role = Column(String, default="user")

    trust_level = Column(Integer, default=1)
    manner_temperature = Column(Float, default=36.5)

    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    admin_role = Column(String, nullable=True, default=None)

    # Push notification preferences
    push_enabled = Column(Boolean, default=True, nullable=False, server_default="true")
    push_chat = Column(Boolean, default=True, nullable=False, server_default="true")
    push_material = Column(Boolean, default=True, nullable=False, server_default="true")
    push_community = Column(Boolean, default=True, nullable=False, server_default="true")
    # 정보통신망법상 광고성 정보는 옵트인이므로 기본값 False
    push_marketing = Column(Boolean, default=False, nullable=False, server_default="false")
    # 광고 수신동의 시각(보존 의무). 철회하면 NULL로 지운다 — 철회 이력은 감사 로그 소관.
    push_marketing_consented_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def avatar_url(self):
        return self.profile_image_url

    # Human-readable label for sqladmin relationship columns (seller, author, etc.)
    def __str__(self) -> str:
        return f"{self.name or self.email or 'User'} (#{self.id})"
