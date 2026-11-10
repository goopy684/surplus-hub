"""Pydantic v2 schemas for all AI endpoints."""

from typing import List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Semantic Search
# ---------------------------------------------------------------------------
class SemanticSearchResult(BaseModel):
    id: int
    title: str
    description: str
    price: int
    category: Optional[str] = None
    thumbnail_url: Optional[str] = Field(None, alias="thumbnailUrl")
    score: float
    vector_similarity: float = Field(alias="vectorSimilarity")
    keyword_score: float = Field(alias="keywordScore")
    distance_km: Optional[float] = Field(None, alias="distanceKm")
    location: Optional[dict] = None

    class Config:
        from_attributes = True
        populate_by_name = True


class SemanticSearchMeta(BaseModel):
    total_count: int = Field(alias="totalCount")
    page: int
    limit: int
    has_next_page: bool = Field(alias="hasNextPage")
    search_mode: str = Field("hybrid", alias="searchMode")

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Search Suggestions
# ---------------------------------------------------------------------------
class SearchSuggestion(BaseModel):
    text: str
    type: str  # "title", "category", "popular"
    count: Optional[int] = None

    class Config:
        populate_by_name = True


class SearchSuggestionsResponse(BaseModel):
    suggestions: List[SearchSuggestion]

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Image Analysis (Vision AI)
# ---------------------------------------------------------------------------
class ImageAnalysisRequest(BaseModel):
    image_url: str = Field(alias="imageUrl")
    # 판매자가 입력한 키워드 (예: "PVC 파이프 50개") — 제목·수량에 우선 반영
    keyword: Optional[str] = Field(None, max_length=100)

    class Config:
        populate_by_name = True


class ImageAnalysisResponse(BaseModel):
    category: Optional[str] = None
    tags: List[str] = []
    title_suggestion: Optional[str] = Field(None, alias="titleSuggestion")
    condition: Optional[str] = None
    material_type: Optional[str] = Field(None, alias="materialType")
    confidence: float = 0.0
    # 키워드에서 읽은 수량 — 있으면 폼 수량을 이 값으로 채운다
    quantity: Optional[int] = None
    quantity_unit: Optional[str] = Field(None, alias="quantityUnit")

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Description Generation (LLM)
# ---------------------------------------------------------------------------
class DescriptionGenerateRequest(BaseModel):
    title: str
    tags: List[str] = []
    category: Optional[str] = None
    condition: Optional[str] = None
    quantity: Optional[int] = None
    quantity_unit: Optional[str] = Field(None, alias="quantityUnit")

    class Config:
        populate_by_name = True


class DescriptionGenerateResponse(BaseModel):
    description: str
    model_used: str = Field(alias="modelUsed")

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Price Suggestion
# ---------------------------------------------------------------------------
class PriceSuggestRequest(BaseModel):
    title: str
    category: Optional[str] = None
    condition: Optional[str] = None
    quantity: Optional[int] = None

    class Config:
        populate_by_name = True


class PriceSuggestResponse(BaseModel):
    suggested_price: int = Field(alias="suggestedPrice")
    price_range_low: int = Field(alias="priceRangeLow")
    price_range_high: int = Field(alias="priceRangeHigh")
    reasoning: str
    similar_count: int = Field(alias="similarCount")

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Chat Suggestions
# ---------------------------------------------------------------------------
class ChatSuggestionRequest(BaseModel):
    room_id: int = Field(alias="roomId")

    class Config:
        populate_by_name = True


class ChatSuggestionResponse(BaseModel):
    suggestions: List[str]

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Community Answer (QA Bot)
# ---------------------------------------------------------------------------
class CommunityAnswerRequest(BaseModel):
    post_id: int = Field(alias="postId")

    class Config:
        populate_by_name = True


class CommunityAnswerResponse(BaseModel):
    answer: str
    model_used: str = Field(alias="modelUsed")

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Discussion Summarize
# ---------------------------------------------------------------------------
class SummarizeRequest(BaseModel):
    post_id: int = Field(alias="postId")

    class Config:
        populate_by_name = True


class SummarizeResponse(BaseModel):
    summary: str
    key_points: List[str] = Field(alias="keyPoints")

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Translation
# ---------------------------------------------------------------------------
class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    source_language: str = Field("auto", alias="sourceLanguage")
    target_language: str = Field(..., alias="targetLanguage")

    class Config:
        populate_by_name = True


class TranslateResponse(BaseModel):
    translated_text: str = Field(alias="translatedText")
    source_language: str = Field(alias="sourceLanguage")
    target_language: str = Field(alias="targetLanguage")
    model_used: str = Field(alias="modelUsed")

    class Config:
        populate_by_name = True
