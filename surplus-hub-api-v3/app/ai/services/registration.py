"""Smart material registration service (Vision AI + LLM pipeline)."""

import json
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

from app.ai.clients.gemini import analyze_image
from app.ai.clients.openai_client import generate_text, DEFAULT_MODEL
from app.ai.prompts.material import (
    DESCRIPTION_GENERATION_PROMPT,
    PRICE_SUGGESTION_PROMPT,
)
from app.crud.crud_category import TRADE_CATEGORIES
from app.schemas.ai_schemas import (
    DescriptionGenerateResponse,
    ImageAnalysisResponse,
    PriceSuggestResponse,
)

logger = logging.getLogger(__name__)


# Vision AI가 업종 카테고리 밖의 이름을 돌려줘도 6개 중 하나로 맞춘다 (위에서부터 먼저 걸리는 쪽 우선).
_CATEGORY_KEYWORDS = {
    "설비": ("설비", "배관", "밸브", "위생"),
    "조명": ("조명", "LED", "등기구"),
    "전기": ("전기", "전선", "케이블", "차단기"),
    "건축자재": (
        "건축자재", "철근", "시멘트", "목재", "타일", "단열재", "페인트",
        "합판", "석고보드", "벽돌", "H빔", "각재",
    ),
    "문/창호": ("창호", "샷시", "새시", "문"),
}

_CONDITION_GRADES = {
    "상": "상", "새제품": "상", "신품": "상", "미개봉": "상", "양호": "상", "A": "상",
    "중": "중", "보통": "중", "B": "중",
    "하": "하", "사용감있음": "하", "불량": "하", "C": "하",
}


def _normalize_category(raw: Optional[str]) -> str:
    """AI 카테고리 출력을 업종 카테고리(TRADE_CATEGORIES) 중 하나로 정규화."""
    text = str(raw or "").strip().upper()
    for category, keywords in _CATEGORY_KEYWORDS.items():
        if any(k in text for k in keywords):
            return category
    return "기타"


def _normalize_condition_grade(raw: Optional[str]) -> Optional[str]:
    """AI 상태 출력을 상/중/하 등급으로 정규화. 알 수 없으면 None."""
    return _CONDITION_GRADES.get(str(raw or "").replace(" ", "").upper())


def analyze_material_image(image_url: str) -> ImageAnalysisResponse:
    """Analyze a material image using Gemini Vision AI."""
    result = analyze_image(image_url, categories=list(TRADE_CATEGORIES))

    return ImageAnalysisResponse(
        category=_normalize_category(result.get("category")),
        tags=result.get("tags", []),
        titleSuggestion=result.get("title_suggestion"),
        condition=_normalize_condition_grade(result.get("condition")),
        materialType=result.get("material_type"),
        confidence=result.get("confidence", 0.0),
    )


def generate_material_description(
    title: str,
    tags: Optional[List[str]] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    quantity: Optional[int] = None,
    quantity_unit: Optional[str] = None,
) -> DescriptionGenerateResponse:
    """Generate a product description using LLM."""
    parts = [f"상품명: {title}"]
    if category:
        parts.append(f"카테고리: {category}")
    if tags:
        parts.append(f"태그: {', '.join(tags)}")
    if condition:
        parts.append(f"상태: {condition}")
    if quantity and quantity_unit:
        parts.append(f"수량: {quantity}{quantity_unit}")

    user_prompt = "\n".join(parts)

    description = generate_text(
        system_prompt=DESCRIPTION_GENERATION_PROMPT,
        user_prompt=user_prompt,
        max_tokens=512,
        temperature=0.7,
    )

    return DescriptionGenerateResponse(
        description=description.strip(),
        modelUsed=DEFAULT_MODEL,
    )


def suggest_material_price(
    db: Session,
    title: str,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    quantity: Optional[int] = None,
) -> PriceSuggestResponse:
    """Suggest a price based on similar materials found via vector search."""
    from app.ai.services.search import vector_search_only

    # Find similar materials for price reference
    similar = vector_search_only(db, query=title, limit=10)

    similar_info = []
    for material, similarity in similar:
        similar_info.append(
            f"- {material.title}: {material.price:,}원 (유사도: {similarity:.2f})"
        )

    parts = [f"자재명: {title}"]
    if category:
        parts.append(f"카테고리: {category}")
    if condition:
        parts.append(f"상태: {condition}")
    if quantity:
        parts.append(f"수량: {quantity}")
    if similar_info:
        parts.append(f"\n유사 매물 ({len(similar_info)}건):")
        parts.extend(similar_info)
    else:
        parts.append("\n유사 매물: 없음 (일반적인 시장 가격 기준으로 제안해주세요)")

    user_prompt = "\n".join(parts)

    raw = generate_text(
        system_prompt=PRICE_SUGGESTION_PROMPT,
        user_prompt=user_prompt,
        max_tokens=256,
        temperature=0.3,
    )

    # Parse JSON response
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Price suggestion LLM returned non-JSON: %s", text[:200])
        data = {
            "suggested_price": 0,
            "price_range_low": 0,
            "price_range_high": 0,
            "reasoning": "가격 산정에 실패했습니다",
        }

    return PriceSuggestResponse(
        suggestedPrice=data.get("suggested_price", 0),
        priceRangeLow=data.get("price_range_low", 0),
        priceRangeHigh=data.get("price_range_high", 0),
        reasoning=data.get("reasoning", ""),
        similarCount=len(similar),
    )
