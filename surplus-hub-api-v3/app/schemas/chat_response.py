from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.response import StandardResponse

class Message(BaseModel):
    id: int
    content: str
    message_type: str = Field(..., alias="messageType")
    sender_id: int = Field(..., alias="senderId")
    is_read: bool = Field(..., alias="isRead")
    created_at: datetime = Field(..., alias="createdAt")
    
    class Config:
        populate_by_name = True
        from_attributes = True

class ChatRoom(BaseModel):
    id: int
    material_id: Optional[int] = Field(None, alias="materialId")
    material_title: Optional[str] = Field(None, alias="materialTitle")
    material_price: Optional[int] = Field(None, alias="materialPrice")
    material_status: Optional[str] = Field(None, alias="materialStatus")
    material_image_url: Optional[str] = Field(None, alias="materialImageUrl")
    other_user_id: int = Field(..., alias="otherUserId")
    other_user_name: str = Field(..., alias="otherUserName")
    other_user_avatar: Optional[str] = Field(None, alias="otherUserAvatar")
    last_message: Optional[str] = Field(None, alias="lastMessage")
    last_message_time: Optional[datetime] = Field(None, alias="lastMessageTime")
    unread_count: int = Field(0, alias="unreadCount")
    
    class Config:
        populate_by_name = True
        from_attributes = True

class ChatRoomDetailResponse(StandardResponse):
    data: ChatRoom

class ChatRoomListResponse(StandardResponse):
    data: List[ChatRoom]

class ChatRoomCreate(BaseModel):
    material_id: Optional[int] = Field(None, alias="materialId")
    seller_id: int = Field(..., alias="sellerId")

    model_config = {"populate_by_name": True}

class MessageCreate(BaseModel):
    content: str
    message_type: str = Field("TEXT", alias="messageType")

class MessageListResponse(StandardResponse):
    data: List[Message]
