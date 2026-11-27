"""구매 요청(구해요/RFQ) API (/api/v1/wanted). 계약: .harness/plan.md 3.6."""

from datetime import timedelta
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.ai.services import triage as triage_service
from app.ai.services import wanted as wanted_service
from app.ai.services.triage import CANDIDATE_LIMIT, _now, _within
from app.crud.crud_category import TRADE_CATEGORIES
from app.crud.crud_moderation import crud_moderation
from app.models.user import User
from app.models.wanted import WantedRequest, open_wanted
from app.schemas.material import Material as MaterialSchema
from app.schemas.wanted import WantedCreate

router = APIRouter()

DAILY_LIMIT = 10  # 사용자당 롤링 24시간 등록 상한 (전광판 수요 조작 방지)
OPEN_LIMIT = 20  # 사용자당 진행 중(OPEN·미만료) 요청 상한


def _get_visible(db: Session, wanted_id: int) -> WantedRequest:
    w = db.get(WantedRequest, wanted_id)
    if w is None or w.status == "HIDDEN":  # 관리자가 숨긴 요청은 존재 여부도 숨긴다
        raise HTTPException(status_code=404, detail="Wanted request not found")
    return w


@router.get("", summary="List open wanted requests (public)")
def list_wanted(
    category: Optional[str] = None,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: float = Query(30, alias="radiusKm", ge=5, le=100),
    cursor: Optional[int] = None,
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(deps.get_db),
) -> Any:
    now = _now()
    q = db.query(WantedRequest).options(joinedload(WantedRequest.user)).filter(open_wanted(now))
    if category and category != "전체":
        q = q.filter(WantedRequest.category == category)
    if cursor is not None:
        q = q.filter(WantedRequest.id < cursor)
    q = q.order_by(WantedRequest.id.desc())
    if lat is not None and lng is not None:
        # ponytail: 최신 CANDIDATE_LIMIT건만 파이썬으로 거리 계산. 요청이 많아지면 좌표 격자 인덱스/PostGIS로 교체
        rows = [
            w for w in q.limit(CANDIDATE_LIMIT).all()
            if _within(lat, lng, w.location_lat, w.location_lng, radius_km)
        ][: limit + 1]
    else:
        rows = q.limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return {
        "status": "success",
        "data": [wanted_service.serialize_wanted(w, now) for w in rows],
        "meta": {"nextCursor": rows[-1].id if has_more else None, "hasMore": has_more},
    }


@router.get("/me", summary="My wanted requests (all statuses)")
def list_my_wanted(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    now = _now()
    rows = (
        db.query(WantedRequest)
        .filter(WantedRequest.user_id == current_user.id)
        .order_by(WantedRequest.id.desc())
        .all()
    )
    return {"status": "success", "data": [wanted_service.serialize_wanted(w, now) for w in rows]}


@router.get("/{wanted_id}", summary="Get wanted request with matching materials (public)")
def read_wanted(wanted_id: int, db: Session = Depends(deps.get_db)) -> Any:
    w = _get_visible(db, wanted_id)
    data = wanted_service.serialize_wanted(w, _now())
    data["matches"] = [
        MaterialSchema.model_validate(m).model_dump(mode="json", by_alias=True)
        for m in wanted_service.find_matches(db, w)
    ]
    return {"status": "success", "data": data}


@router.post("", summary="Create wanted request")
def create_wanted(
    body: WantedCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if body.category not in TRADE_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Unknown category: {body.category}")
    now = _now()
    mine = db.query(func.count(WantedRequest.id)).filter(WantedRequest.user_id == current_user.id)
    if (mine.filter(WantedRequest.created_at >= now - timedelta(hours=24)).scalar() or 0) >= DAILY_LIMIT:
        raise HTTPException(
            status_code=429, detail=f"구매 요청은 하루 {DAILY_LIMIT}건까지 등록할 수 있습니다",
            headers={"Retry-After": "3600"},
        )
    if (mine.filter(open_wanted(now)).scalar() or 0) >= OPEN_LIMIT:
        raise HTTPException(
            status_code=429, detail=f"진행 중인 구매 요청은 {OPEN_LIMIT}건까지입니다. 지난 요청을 마감한 뒤 등록해 주세요",
        )
    hits = crud_moderation.check_banned_words(db, text=f"{body.title}\n{body.description or ''}")
    if hits:
        raise HTTPException(status_code=400, detail=f"금칙어가 포함되어 등록할 수 없습니다: {', '.join(hits)}")

    w = WantedRequest(
        user_id=current_user.id,
        title=body.title,
        description=body.description or None,
        category=body.category,
        quantity=body.quantity,
        quantity_unit=body.quantity_unit,
        budget_max=body.budget_max,
        location_address=body.location_address,
        location_lat=body.lat,
        location_lng=body.lng,
        radius_km=body.radius_km,
        status="OPEN",
        expires_at=now + timedelta(days=body.expires_in_days),
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    # 새 요청은 곧 수요다 — 검색을 기다리지 않고 맞는 보관함 진단을 재산정해 오르면 알린다 (검색과 같은 경로)
    background_tasks.add_task(
        triage_service.rescore_vault_for_search_background, db.get_bind(), w.title, w.location_lat, w.location_lng,
    )
    return {"status": "success", "data": wanted_service.serialize_wanted(w, now)}


@router.post("/{wanted_id}/close", summary="Close my wanted request")
def close_wanted(
    wanted_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    w = _get_visible(db, wanted_id)
    if w.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to close this wanted request")
    w.status = "CLOSED"
    db.commit()
    db.refresh(w)
    return {"status": "success", "data": wanted_service.serialize_wanted(w, _now())}
