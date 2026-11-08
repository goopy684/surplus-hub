from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import backref, relationship
from sqlalchemy.sql import func
from app.db.base import Base


class MaterialLike(Base):
    __tablename__ = "material_likes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    material = relationship("Material")

    __table_args__ = (
        UniqueConstraint("user_id", "material_id", name="uq_material_like"),
    )


class PostLike(Base):
    __tablename__ = "post_likes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    post = relationship("Post", backref=backref("likes", cascade="all, delete-orphan"))

    __table_args__ = (
        UniqueConstraint("user_id", "post_id", name="uq_post_like"),
    )
