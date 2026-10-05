from typing import Optional
from pydantic import BaseModel, EmailStr
from app.schemas.stored_url import StoredUrl

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[int] = None

class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    is_active: Optional[bool] = True

class UserCreate(UserBase):
    email: EmailStr
    password: str
    name: str

class UserUpdate(UserBase):
    password: Optional[str] = None
    name: Optional[str] = None
    profile_image_url: Optional[StoredUrl] = None
    location: Optional[str] = None

class UserInDBBase(UserBase):
    id: Optional[int] = None

    model_config = {"from_attributes": True}

class User(UserInDBBase):
    pass
