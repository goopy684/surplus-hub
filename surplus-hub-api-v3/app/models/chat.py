from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class ChatRoom(Base):
    __tablename__ = "chat_rooms"
    __table_args__ = (
        UniqueConstraint("material_id", "buyer_id", "seller_id", name="uq_chatroom_material_buyer_seller"),
    )

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)

    buyer_id = Column(Integer, ForeignKey("users.id"))
    seller_id = Column(Integer, ForeignKey("users.id"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("Material")
    buyer = relationship("User", foreign_keys=[buyer_id])
    seller = relationship("User", foreign_keys=[seller_id])

    def __str__(self) -> str:
        return f"ChatRoom #{self.id} (material={self.material_id})"

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    chat_room_id = Column(Integer, ForeignKey("chat_rooms.id"), index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), index=True)

    content = Column(Text, nullable=False)
    message_type = Column(String, default="TEXT") # TEXT, IMAGE, LOCATION

    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    chat_room = relationship("ChatRoom", backref="messages")
    sender = relationship("User")

    def __str__(self) -> str:
        body = (self.content or "")[:40]
        return f"Message #{self.id}: {body}"
