"""Smart material registration service (Vision AI + LLM pipeline)."""

import json
import logging
import re
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.ai.clients.gemini import analyze_image
from app.ai.clients.openai_client import generate_text, DEFAULT_MODEL
from app.ai.prompts.material import (
    DESCRIPTION_GENERATION_PROMPT,
    PRICE_SUGGESTION_PROMPT,
)
from app.ai.text import strip_markdown
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


# 웹 QUANTITY_UNITS와 같은 단위. 긴 것부터 ("m²"가 "m"보다 먼저).
# 숫자 앞에 글자·숫자·소수점·쉼표가 붙거나("1.5m", "SUS30450개") 단위 뒤에 글자가 이어지면("2개소", "12mm", "50A")
# 수량이 아니다. 케이스 표: app/tests/fixtures/ai_text_cases.json
_QUANTITY_RE = re.compile(
    r"(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)\s*(개|장|박스|m²|m³|kg|톤|롤|세트|m)(?![\w²³.,])"
)


def parse_keyword(keyword: Optional[str]) -> Tuple[str, Optional[int], Optional[str]]:
    """판매자 키워드를 (자재명, 수량, 단위)로 나눈다. "PVC 파이프 50개" -> ("PVC 파이프", 50, "개").

    수량이 정확히 하나일 때만 읽는다. 애매하면 부분 파싱하지 않고 수량 없음으로 둔다.
    """
    text = " ".join(str(keyword or "").split())
    matches = list(_QUANTITY_RE.finditer(text))
    if len(matches) != 1:
        return text, None, None
    m = matches[0]
    name = " ".join((text[: m.start()] + text[m.end():]).split())
    return name, int(m.group(1).replace(",", "")), m.group(2)


def _title_with_keyword(ai_title: Optional[str], name: str) -> Optional[str]:
    """AI 제목이 판매자가 입력한 자재명을 담지 않으면 판매자 입력을 제목으로 쓴다."""
    if not name:
        return ai_title
    squash = lambda s: re.sub(r"\s+", "", s).lower()  # noqa: E731
    if ai_title and squash(name) in squash(ai_title):
        return ai_title
    return name


def analyze_material_image(image_url: str, keyword: Optional[str] = None) -> ImageAnalysisResponse:
    """Analyze a material image using Gemini Vision AI.

    판매자 키워드가 있으면 이미지 추정보다 우선한다 (제목·수량).
    """
    result = analyze_image(image_url, categories=list(TRADE_CATEGORIES), keyword=keyword or None)
    name, quantity, quantity_unit = parse_keyword(keyword)

    return ImageAnalysisResponse(
        category=_normalize_category(result.get("category")),
        tags=result.get("tags", []),
        titleSuggestion=_title_with_keyword(result.get("title_suggestion"), name),
        condition=_normalize_condition_grade(result.get("condition")),
        materialType=result.get("material_type"),
        confidence=result.get("confidence", 0.0),
        quantity=quantity,
        quantityUnit=quantity_unit,
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
        description=strip_markdown(description),
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
        reasoning=strip_markdown(str(data.get("reasoning", ""))),
        similarCount=len(similar),
    )
