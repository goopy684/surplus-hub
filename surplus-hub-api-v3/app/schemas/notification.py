from typing import Literal, Optional, List
from pydantic import BaseModel, Field, AliasChoices, field_validator
from datetime import datetime


class NotificationBase(BaseModel):
    type: str
    title: str
    body: str
    reference_type: Optional[str] = Field(None, alias="referenceType")
    reference_id: Optional[int] = Field(None, alias="referenceId")


class NotificationCreate(NotificationBase):
    user_id: int = Field(..., alias="userId")
    model_config = {"populate_by_name": True}


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    body: str
    reference_type: Optional[str] = Field(None, alias="referenceType")
    reference_id: Optional[int] = Field(None, alias="referenceId")
    is_read: bool = Field(False, alias="isRead")
    created_at: datetime = Field(..., alias="createdAt")

    model_config = {"populate_by_name": True, "from_attributes": True}


class DeviceTokenCreate(BaseModel):
    # B4/B5: token, device_token, deviceToken 모두 허용
    token: str = Field(
        ...,
        validation_alias=AliasChoices("token", "device_token", "deviceToken"),
    )
    platform: Literal["ios", "android", "web", "expo"] = "ios"

    model_config = {"populate_by_name": True}


class DeviceTokenResponse(BaseModel):
    id: int
    token: str
    platform: str
    is_active: bool = Field(True, alias="isActive")

    model_config = {"populate_by_name": True, "from_attributes": True}


class NotificationPreferences(BaseModel):
    push_enabled: bool = Field(True, alias="pushEnabled")
    push_chat: bool = Field(True, alias="pushChat")
    push_material: bool = Field(True, alias="pushMaterial")
    push_community: bool = Field(True, alias="pushCommunity")
    push_marketing: bool = Field(False, alias="pushMarketing")

    model_config = {"populate_by_name": True, "from_attributes": True}


class NotificationPreferencesUpdate(BaseModel):
    # 보낸 필드만 적용하는 PATCH 시맨틱
    push_enabled: Optional[bool] = Field(None, alias="pushEnabled")
    push_chat: Optional[bool] = Field(None, alias="pushChat")
    push_material: Optional[bool] = Field(None, alias="pushMaterial")
    push_community: Optional[bool] = Field(None, alias="pushCommunity")
    push_marketing: Optional[bool] = Field(None, alias="pushMarketing")

    model_config = {"populate_by_name": True}

    @field_validator("*", mode="before")
    @classmethod
    def _reject_explicit_null(cls, v):
        # 컬럼은 nullable=False다. 보내지 않은 필드는 검증을 타지 않으므로 PATCH
        # 시맨틱은 그대로고, 명시적 null만 422로 막는다.
        if v is None:
            raise ValueError("must be true or false, not null")
        return v


class UnreadCountResponse(BaseModel):
    unread_count: int = Field(..., alias="unreadCount")
    
    model_config = {"populate_by_name": True}
