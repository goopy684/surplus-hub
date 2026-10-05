from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from app.schemas.stored_url import StoredUrl

class Location(BaseModel):
    address: str
    lat: Optional[float] = None
    lng: Optional[float] = None

class MaterialBase(BaseModel):
    title: str
    description: str
    price: int
    quantity: Optional[int] = 1
    quantity_unit: Optional[str] = Field("개", alias="quantityUnit")
    trade_method: Optional[str] = Field("DIRECT", alias="tradeMethod")
    location: Location
    category: Optional[str] = None
    condition_grade: Optional[str] = Field(None, alias="conditionGrade")
    status: Optional[str] = "ACTIVE"

    # B1: location 필드가 문자열로 전달될 경우 자동으로 객체로 변환
    @field_validator("location", mode="before")
    @classmethod
    def parse_location(cls, v):
        if isinstance(v, str):
            return {"address": v}
        return v

    class Config:
        populate_by_name = True

class MaterialCreate(MaterialBase):
    photo_urls: Optional[List[StoredUrl]] = Field(None, alias="photoUrls")

class MaterialUpdate(MaterialBase):
    pass

class Seller(BaseModel):
    id: int
    name: str
    avatar_url: Optional[str] = Field(None, alias="avatarUrl")
    # For simple mapping from User model profile_image_url to avatarUrl, we might need a root validator or property
    # But User model has profile_image_url. 
    # Let's rely on manual mapping or alias if the source attribute matches. 
    # Since source is profile_image_url, and alias is avatarUrl, we need to tell pydantic to map it.
    # In Pydantic v2, we can use Field(validation_alias="...") but here we are using v1 style or v2 with from_attributes.
    # Let's assume we will map it manually or add property to User model.
    
    class Config:
        from_attributes = True
        populate_by_name = True

class Material(MaterialBase):
    id: int
    seller_id: int
    seller: Optional[Seller] = None
    created_at: datetime
    images: List[str] = [] # Mock images
    thumbnail_url: Optional[str] = Field(None, alias="thumbnailUrl")

    @property
    def thumbnail_url_prop(self):
        if self.images:
            return self.images[0]
        return None
    
    class Config:
        from_attributes = True
        populate_by_name = True
