"""구매 요청(구해요/RFQ) 생성 스키마.

응답은 app.ai.services.wanted.serialize_wanted 한 곳에서 계약(camelCase) 그대로 만든다.
"""

from typing import Optional

from pydantic import BaseModel, Field


class WantedCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    category: str = Field(..., max_length=20)  # 업종 카테고리 6종 — 엔드포인트에서 시드 기준으로 검증
    quantity: Optional[int] = Field(None, ge=0, le=1_000_000)
    quantity_unit: Optional[str] = Field(None, alias="quantityUnit", max_length=20)
    budget_max: Optional[int] = Field(None, alias="budgetMax", ge=0, le=2_000_000_000)
    location_address: str = Field(..., alias="locationAddress", min_length=1, max_length=200)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius_km: int = Field(30, alias="radiusKm", ge=5, le=100)
    expires_in_days: int = Field(30, alias="expiresInDays", ge=1, le=90)

    model_config = {"populate_by_name": True, "str_strip_whitespace": True}
