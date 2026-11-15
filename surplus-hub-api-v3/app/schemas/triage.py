"""거래 전 AI 유동성 진단(triage) 요청 스키마.

응답은 app.ai.services.triage.serialize_diagnosis 한 곳에서 계약(camelCase) 그대로 만든다.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.stored_url import StoredUrl


class TriageRequest(BaseModel):
    # 업로드된 URL만 (data: URL 금지), 최대 3장
    image_urls: List[StoredUrl] = Field(default_factory=list, alias="imageUrls", max_length=3)
    spec_text: Optional[str] = Field(None, alias="specText", max_length=1000)
    label_text: Optional[str] = Field(None, alias="labelText", max_length=500)
    # 품목(업종 카테고리) — 재사용 수요의 기본값을 정한다. 소재(materialKey)는 고철 단가용
    category: Optional[str] = Field(None, max_length=20)
    material_key: Optional[str] = Field(None, alias="materialKey", max_length=30)
    condition_grade: Optional[Literal["상", "중", "하"]] = Field(None, alias="conditionGrade")
    quantity: Optional[int] = Field(None, ge=0, le=1_000_000)
    quantity_unit: Optional[str] = Field(None, alias="quantityUnit", max_length=20)
    weight_kg: Optional[float] = Field(None, alias="weightKg", gt=0, le=50_000)  # 서비스 MAX_WEIGHT_KG
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    location_address: Optional[str] = Field(None, alias="locationAddress", max_length=200)

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def _require_input(self):
        if not (self.image_urls or (self.spec_text or "").strip() or self.material_key or self.category):
            raise ValueError("imageUrls, specText, materialKey, category 중 하나는 필요합니다")
        return self


class TriageConvertRequest(BaseModel):
    price: Optional[int] = Field(None, ge=0, le=2_000_000_000)  # materials.price는 Integer
    title: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=5000)
    # 판매자 경로 재지정 — 매물 행에만 쓰고 진단 행의 AI 판정은 그대로 둔다
    path: Optional[Literal["A", "B", "C"]] = None

    model_config = {"populate_by_name": True}
