from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class TransactionCreate(BaseModel):
    material_id: int = Field(..., alias="materialId")
    quantity: Optional[int] = Field(None, ge=1)  # 생략 시 잔여 수량 전체 구매
    note: Optional[str] = None

    model_config = {"populate_by_name": True}


class TransactionResponse(BaseModel):
    id: int
    material_id: int = Field(..., alias="materialId")
    material_title: Optional[str] = Field(None, alias="materialTitle")
    seller_id: int = Field(..., alias="sellerId")
    seller_name: Optional[str] = Field(None, alias="sellerName")
    buyer_id: int = Field(..., alias="buyerId")
    buyer_name: Optional[str] = Field(None, alias="buyerName")
    price: int
    quantity: Optional[int] = None
    status: str
    has_reviewed: bool = Field(False, alias="hasReviewed")
    note: Optional[str] = None
    created_at: datetime = Field(..., alias="createdAt")
    confirmed_at: Optional[datetime] = Field(None, alias="confirmedAt")
    completed_at: Optional[datetime] = Field(None, alias="completedAt")

    model_config = {"populate_by_name": True, "from_attributes": True}
