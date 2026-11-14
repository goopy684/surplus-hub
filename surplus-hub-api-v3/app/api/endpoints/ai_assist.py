"""AI Assist API endpoints."""

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api import deps
from app.core.cache import cache_get_json, cache_set_json, make_cache_key
from app.core.rate_limit import limiter
from app.crud.crud_chat import crud_chat_room
from app.models.user import User
from app.schemas.ai_schemas import (
    ChatSuggestionRequest,
    ChatSuggestionResponse,
    CommunityAnswerRequest,
    CommunityAnswerResponse,
    DescriptionGenerateRequest,
    DescriptionGenerateResponse,
    DisposalEvaluateRequest,
    DisposalOverrideRequest,
    ImageAnalysisRequest,
    ImageAnalysisResponse,
    PriceSuggestRequest,
    PriceSuggestResponse,
    SearchSuggestion,
    SearchSuggestionsResponse,
    SemanticSearchMeta,
    SemanticSearchResult,
    SummarizeRequest,
    SummarizeResponse,
    TranslateRequest,
    TranslateResponse,
)
from app.ai.services import search as search_service
from app.ai.services import registration as registration_service
from app.ai.services import qa_bot as qa_bot_service
from app.ai.services import translation as translation_service
from app.ai.services import disposal_gate
from app.models.disposal_advisory import DisposalAdvisory

logger = logging.getLogger(__name__)

router = APIRouter()


def _is_rate_limit_error(exc: Exception) -> bool:
    """Check if exception is an upstream rate limit (429) error."""
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status_code == 429:
        return True
    exc_str = str(exc).lower()
    return "429" in exc_str or "rate limit" in exc_str


def _handle_ai_error(exc: Exception, service_name: str) -> HTTPException:
    """Log the error and return appropriate HTTP exception with debug details."""
    if _is_rate_limit_error(exc):
        logger.warning("Rate limit hit for %s: %s", service_name, exc)
        return HTTPException(
            status_code=429,
            detail=f"{service_name} rate limit exceeded. Please try again later.",
            headers={"Retry-After": "60"},
        )
    logger.exception("Error in %s", service_name)
    error_type = type(exc).__name__
    error_msg = str(exc)
    # Truncate very long messages (e.g. traceback noise)
    if len(error_msg) > 500:
        error_msg = error_msg[:500] + "..."
    return HTTPException(
        status_code=502,
        detail={
            "message": f"{service_name} unavailable",
            "error": error_type,
            "reason": error_msg,
        },
    )


# ---------------------------------------------------------------------------
# Phase 1: Semantic Search (with dynamic filters)
# ---------------------------------------------------------------------------
@router.get(
    "/search",
    summary="Hybrid Semantic Search",
    description="Search materials using keyword + vector similarity with dynamic filters.",
)
@limiter.limit("30/minute")
def semantic_search(
    request: Request,
    q: str,
    page: int = 1,
    limit: int = 20,
    category: Optional[str] = None,
    price_min: Optional[int] = Query(None, alias="priceMin", ge=0),
    price_max: Optional[int] = Query(None, alias="priceMax", ge=0),
    location_lat: Optional[float] = Query(None, alias="locationLat"),
    location_lng: Optional[float] = Query(None, alias="locationLng"),
    radius_km: Optional[float] = Query(None, alias="radiusKm", ge=0, le=500),
    date_from: Optional[datetime] = Query(None, alias="dateFrom"),
    date_to: Optional[datetime] = Query(None, alias="dateTo"),
    trade_method: Optional[str] = Query(None, alias="tradeMethod"),
    sort_by: Optional[str] = Query("relevance", alias="sortBy"),
    db: Session = Depends(deps.get_db),
) -> Any:
    results, total, search_mode = search_service.hybrid_search(
        db,
        query=q,
        page=page,
        limit=limit,
        category=category,
        price_min=price_min,
        price_max=price_max,
        location_lat=location_lat,
        location_lng=location_lng,
        radius_km=radius_km,
        date_from=date_from,
        date_to=date_to,
        trade_method=trade_method,
        sort_by=sort_by or "relevance",
    )

    total_pages = (total + limit - 1) // limit if total > 0 else 0

    data = []
    for r in results:
        m = r["material"]
        location = None
        # 좌표 없이 주소만 있는 매물도 주소는 보여준다
        if m.location_address or (m.location_lat is not None and m.location_lng is not None):
            location = {
                "address": m.location_address,
                "lat": m.location_lat,
                "lng": m.location_lng,
            }
        data.append(
            SemanticSearchResult(
                id=m.id,
                title=m.title,
                description=m.description[:200],
                price=m.price,
                category=m.category,
                thumbnailUrl=m.thumbnail_url,
                score=r["score"],
                vectorSimilarity=r["vector_similarity"],
                keywordScore=r["keyword_score"],
                distanceKm=r.get("distance_km"),
                location=location,
            )
        )

    # Log search query asynchronously (best-effort)
    search_service.log_search_query(db, query=q, results_count=total)

    return {
        "status": "success",
        "data": [d.model_dump(by_alias=True) for d in data],
        "meta": SemanticSearchMeta(
            totalCount=total,
            page=page,
            limit=limit,
            hasNextPage=page < total_pages,
            searchMode=search_mode,
        ).model_dump(by_alias=True),
    }


# ---------------------------------------------------------------------------
# Phase 3: Search Suggestions (autocomplete)
# ---------------------------------------------------------------------------
@router.get(
    "/search/suggestions",
    summary="Search Suggestions",
    description="Get autocomplete suggestions for search queries.",
)
@limiter.limit("60/minute")
def search_suggestions(
    request: Request,
    q: str = Query(..., min_length=2),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(deps.get_db),
) -> Any:
    key = make_cache_key("ai:suggestions", q=q.strip().lower(), limit=limit)
    cached = cache_get_json(key)
    if cached is not None:
        return cached

    suggestions = search_service.get_search_suggestions(db, query=q.strip(), limit=limit)

    result = {
        "status": "success",
        "data": SearchSuggestionsResponse(
            suggestions=[SearchSuggestion(**s) for s in suggestions]
        ).model_dump(mode="json", by_alias=True),
    }
    cache_set_json(key, result, ttl_seconds=300)
    return result


# ---------------------------------------------------------------------------
# Phase 2: Image Analysis
# ---------------------------------------------------------------------------
@router.post(
    "/analyze-image",
    summary="Analyze Material Image",
    description="Analyze a material image using Vision AI.",
)
@limiter.limit("10/minute")
def analyze_image(
    request: Request,
    body: ImageAnalysisRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    try:
        result = registration_service.analyze_material_image(body.image_url, body.keyword)
    except Exception as exc:
        raise _handle_ai_error(exc, "Vision AI service")

    return {
        "status": "success",
        "data": result.model_dump(by_alias=True),
    }


# ---------------------------------------------------------------------------
# 모듈 0: 처분 경로 판별 게이트 (판매글·시세 LLM 호출 전)
# ---------------------------------------------------------------------------
@router.post(
    "/evaluate-disposal",
    summary="Evaluate Disposal Route",
    description="Decide REUSE / RECYCLE / SCRAP from image analysis + similar listings and trades, and record it.",
)
@limiter.limit("20/minute")
def evaluate_disposal(
    request: Request,
    body: DisposalEvaluateRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    advisory = disposal_gate.evaluate_disposal(
        db,
        user_id=current_user.id,
        title=body.title,
        category=body.category,
        condition=body.condition,
        tags=body.tags,
        material_type=body.material_type,
        damage_level=body.damage_level,
        is_mixed_waste=body.is_mixed_waste,
        recyclable_material=body.recyclable_material,
    )
    return {
        "status": "success",
        "data": disposal_gate.to_response(advisory).model_dump(by_alias=True),
    }


@router.patch(
    "/disposal-advisories/{advisory_id}",
    summary="Override Disposal Route",
    description="Seller re-selects the disposal route of their own advisory.",
)
@limiter.limit("30/minute")
def override_disposal_route(
    request: Request,
    advisory_id: int,
    body: DisposalOverrideRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    # 매물 등록(POST /materials/)과 같은 행 잠금 — 연결 직전 재지정이 끼어들지 않게
    advisory = db.query(DisposalAdvisory).filter(DisposalAdvisory.id == advisory_id).with_for_update().first()
    if not advisory:
        raise HTTPException(status_code=404, detail="Disposal advisory not found")
    if advisory.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this advisory")
    if advisory.material_id is not None:
        raise HTTPException(status_code=422, detail="이미 매물 등록에 사용된 판정은 변경할 수 없습니다.")
    error = disposal_gate.override_error(advisory, body.selected_route, body.override_reason)
    if error:
        raise HTTPException(status_code=422, detail=error)

    disposal_gate.apply_override(advisory, body.selected_route, body.override_reason)
    db.commit()
    db.refresh(advisory)
    return {
        "status": "success",
        "data": disposal_gate.to_response(advisory).model_dump(by_alias=True),
    }


# ---------------------------------------------------------------------------
# Phase 2: Description Generation
# ---------------------------------------------------------------------------
@router.post(
    "/generate-description",
    summary="Generate Material Description",
    description="Auto-generate a product description using LLM.",
)
@limiter.limit("10/minute")
def generate_description(
    request: Request,
    body: DescriptionGenerateRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    try:
        result = registration_service.generate_material_description(
            title=body.title,
            tags=body.tags,
            category=body.category,
            condition=body.condition,
            quantity=body.quantity,
            quantity_unit=body.quantity_unit,
        )
    except Exception as exc:
        raise _handle_ai_error(exc, "LLM service")

    return {
        "status": "success",
        "data": result.model_dump(by_alias=True),
    }


# ---------------------------------------------------------------------------
# Phase 2: Price Suggestion
# ---------------------------------------------------------------------------
@router.post(
    "/suggest-price",
    summary="Suggest Material Price",
    description="Suggest a fair price based on similar materials.",
)
@limiter.limit("10/minute")
def suggest_price(
    request: Request,
    body: PriceSuggestRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    key = make_cache_key(
        "ai:price", title=body.title.strip().lower(), category=body.category,
        condition=body.condition, quantity=body.quantity,
    )
    cached = cache_get_json(key)
    if cached is not None:
        return cached

    try:
        result = registration_service.suggest_material_price(
            db=db,
            title=body.title.strip(),
            category=body.category,
            condition=body.condition,
            quantity=body.quantity,
        )
    except Exception as exc:
        raise _handle_ai_error(exc, "Price suggestion service")

    response = {
        "status": "success",
        "data": result.model_dump(mode="json", by_alias=True),
    }
    cache_set_json(key, response, ttl_seconds=1800)
    return response


# ---------------------------------------------------------------------------
# Phase 3: Chat Suggestions
# ---------------------------------------------------------------------------
@router.post(
    "/chat-suggestions",
    summary="Chat Reply Suggestions",
    description="Get AI-suggested quick replies for a chat room.",
)
@limiter.limit("20/minute")
def chat_suggestions(
    request: Request,
    body: ChatSuggestionRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    # 대화 내용을 LLM에 넘기므로 판매자·구매자만 (chats.py read_chat_room과 같은 검사)
    room = crud_chat_room.get(db, id=body.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")
    if not crud_chat_room.is_participant(room, current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to access this chat room")

    try:
        result = qa_bot_service.generate_chat_suggestions(
            db=db, room_id=body.room_id, current_user_id=current_user.id
        )
    except Exception as exc:
        raise _handle_ai_error(exc, "Chat AI service")

    return {
        "status": "success",
        "data": result.model_dump(by_alias=True),
    }


# ---------------------------------------------------------------------------
# Phase 3: Community Answer
# ---------------------------------------------------------------------------
@router.post(
    "/community-answer",
    summary="AI Community Answer",
    description="Generate an AI answer for a community post.",
)
@limiter.limit("5/minute")
def community_answer(
    request: Request,
    body: CommunityAnswerRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    try:
        result = qa_bot_service.generate_community_answer(db=db, post_id=body.post_id)
    except Exception as exc:
        raise _handle_ai_error(exc, "QA bot service")

    return {
        "status": "success",
        "data": result.model_dump(by_alias=True),
    }


# ---------------------------------------------------------------------------
# Phase 3: Discussion Summarize
# ---------------------------------------------------------------------------
@router.post(
    "/summarize-discussion",
    summary="Summarize Discussion",
    description="Summarize a community post and its comments.",
)
@limiter.limit("5/minute")
def summarize_discussion_endpoint(
    request: Request,
    body: SummarizeRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    try:
        result = qa_bot_service.summarize_discussion(db=db, post_id=body.post_id)
    except Exception as exc:
        raise _handle_ai_error(exc, "Summarization service")

    return {
        "status": "success",
        "data": result.model_dump(by_alias=True),
    }


# ---------------------------------------------------------------------------
# Phase 3: Translation
# ---------------------------------------------------------------------------
@router.post(
    "/translate",
    summary="Translate Text",
    description="Translate text between languages using LLM.",
)
@limiter.limit("20/minute")
def translate(
    request: Request,
    body: TranslateRequest,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    try:
        result = translation_service.translate_text(
            text=body.text,
            source_language=body.source_language,
            target_language=body.target_language,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise _handle_ai_error(exc, "Translation service")

    return {
        "status": "success",
        "data": result.model_dump(by_alias=True),
    }
