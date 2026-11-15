"""거래 전 AI 유동성 진단 & 3-Way 처분 라우팅 API (/api/v1/ai/triage)."""

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.ai.services import triage as triage_service
from app.core.cache import cache_get_json, cache_set_json, invalidate_material_caches, make_cache_key
from app.core.rate_limit import limiter
from app.models.material import Material
from app.models.material_image import MaterialImage
from app.models.triage import AiTriageDiagnosis
from app.models.user import User
from app.schemas.triage import TriageConvertRequest, TriageRequest

router = APIRouter()


def _get_own(db: Session, diagnosis_id: int, user: User) -> AiTriageDiagnosis:
    diag = db.get(AiTriageDiagnosis, diagnosis_id)
    if diag is None or diag.user_id != user.id:  # 남의 진단은 존재 여부도 숨긴다
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    return diag


@router.post("", summary="Create AI triage diagnosis")
@limiter.limit("10/minute")
def create_diagnosis(
    request: Request,
    body: TriageRequest,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if body.material_key and body.material_key not in triage_service.MATERIALS:
        raise HTTPException(status_code=422, detail=f"Unknown materialKey: {body.material_key}")
    if body.category and body.category not in triage_service.CATEGORY_PRIORS:
        raise HTTPException(status_code=422, detail=f"Unknown category: {body.category}")
    if triage_service.count_recent(db, current_user.id) >= triage_service.DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"진단은 하루 {triage_service.DAILY_LIMIT}회까지 가능합니다",
            headers={"Retry-After": "3600"},
        )
    diag = triage_service.diagnose(db, current_user, body)
    return {"status": "success", "data": triage_service.serialize_diagnosis(diag)}


@router.get("/vault", summary="My triage vault (rescored on read)")
def read_vault(
    include_listed: bool = Query(False, alias="includeListed"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    statuses = [triage_service.STATUS_VAULT]
    if include_listed:
        statuses.append(triage_service.STATUS_LISTED)
    rows = (
        db.query(AiTriageDiagnosis)
        .filter(AiTriageDiagnosis.user_id == current_user.id, AiTriageDiagnosis.status.in_(statuses))
        .order_by(AiTriageDiagnosis.id.desc())
        .all()
    )
    for diag in rows:
        triage_service.rescore(db, diag)
    db.commit()
    return {
        "status": "success",
        "data": [triage_service.serialize_diagnosis(d) for d in rows],
        "meta": {"totalCount": len(rows)},
    }


@router.get("/hot-demands", summary="Nearby hot demand board (public)")
def read_hot_demands(
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: float = Query(triage_service.RADIUS_KM, alias="radiusKm", gt=0, le=100),
    min_score: int = Query(0, alias="minScore", ge=0, le=100),
    db: Session = Depends(deps.get_db),
) -> Any:
    if lat is None or lng is None:
        lat = lng = None
    key = make_cache_key(
        "ai:triage:hot",
        lat=round(lat, 2) if lat is not None else None,
        lng=round(lng, 2) if lng is not None else None,
        radius=radius_km, min_score=min_score,
    )
    cached = cache_get_json(key)
    if cached is not None:
        return cached
    result = {
        "status": "success",
        "data": triage_service.hot_demands(db, lat, lng, radius_km=radius_km, min_score=min_score),
    }
    cache_set_json(key, result, ttl_seconds=300)
    return result


@router.get("/shared/{token}", summary="Shared triage report (public)")
def read_shared(token: str, db: Session = Depends(deps.get_db)) -> Any:
    diag = db.query(AiTriageDiagnosis).filter(AiTriageDiagnosis.share_token == token).first()
    if diag is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"status": "success", "data": triage_service.serialize_diagnosis(diag, public=True)}


@router.get("/funnel", summary="Triage funnel metrics (admin)")
def read_funnel(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    return {"status": "success", "data": triage_service.funnel(db, days)}


@router.get("/{diagnosis_id}", summary="Get my diagnosis")
def read_diagnosis(
    diagnosis_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    diag = _get_own(db, diagnosis_id, current_user)
    if diag.notified_at is not None and diag.reopened_at is None:  # 알림 뒤 첫 조회 = 푸시 재방문
        diag.reopened_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(diag)
    return {"status": "success", "data": triage_service.serialize_diagnosis(diag)}


@router.post("/{diagnosis_id}/save-vault", summary="Save diagnosis to my vault")
def save_vault(
    diagnosis_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    diag = _get_own(db, diagnosis_id, current_user)
    if diag.status == triage_service.STATUS_LISTED:
        raise HTTPException(status_code=409, detail="Already listed as a material")
    if diag.status == triage_service.STATUS_DIAGNOSED:
        # 사진만 있고 소재·규격이 없으면 검색어와 맞춰 볼 단어가 없어 알림이 영영 오지 않는다
        if not triage_service.can_watch_demand(diag):
            raise HTTPException(
                status_code=422,
                detail={"code": "NO_DEMAND_TERMS", "message": "소재나 규격을 입력해야 수요 알림을 받을 수 있습니다"},
            )
        diag.status = triage_service.STATUS_VAULT
        diag.vault_saved_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(diag)
    return {"status": "success", "data": triage_service.serialize_diagnosis(diag)}


def _default_description(diag: AiTriageDiagnosis) -> str:
    """LLM 없이 진단 정보로 만드는 기본 설명."""
    lines = [
        f"{diag.title} 판매합니다.",
        f"- 소재: {triage_service._material(diag.material_key)['label']}",
    ]
    if diag.condition_grade:
        lines.append(f"- 상태: {diag.condition_grade}")
    if diag.quantity:
        lines.append(f"- 수량: {diag.quantity}{diag.quantity_unit or ''}")
    if diag.spec_text:
        lines.append(f"- 규격: {diag.spec_text}")
    lines.append(f"(AI 유동성 진단 {diag.liquidity_score}점)")
    return "\n".join(lines)


@router.post("/{diagnosis_id}/convert", summary="Convert diagnosis into a material listing")
def convert(
    diagnosis_id: int,
    background_tasks: BackgroundTasks,
    body: Optional[TriageConvertRequest] = Body(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    _get_own(db, diagnosis_id, current_user)  # 소유 확인(404) 후 잠그고 다시 읽는다 — 더블클릭 중복 등록 방지
    diag = (
        db.query(AiTriageDiagnosis)
        .filter(AiTriageDiagnosis.id == diagnosis_id)
        .populate_existing()
        .with_for_update()
        .one()
    )
    if diag.status == triage_service.STATUS_LISTED:
        raise HTTPException(
            status_code=409,
            detail={"message": "Already listed as a material", "materialId": diag.material_id},
        )
    body = body or TriageConvertRequest()
    path = body.path or diag.disposition_path  # 판매자 재지정은 매물 행에만 쓴다
    if body.price is not None:
        price = body.price
    else:
        price = diag.direct_sale_price if path == "A" else diag.scrap_value
    # 매물·이미지·진단 상태를 한 트랜잭션으로 커밋한다. 중간에 실패하면 전부 되돌아가
    # "등록됨인데 매물 없음"이나 "경로 없는 B/C 매물이 메인 피드에 노출" 같은 반쪽 상태가 남지 않는다.
    material = Material(
        title=body.title or diag.title,
        description=body.description or _default_description(diag),
        price=price or 0,
        quantity=diag.quantity or 1,
        quantity_unit=diag.quantity_unit or "개",
        trade_method="DIRECT",
        location_address=diag.location_address or "위치 미정",
        location_lat=diag.location_lat,
        location_lng=diag.location_lng,
        category=diag.category,
        condition_grade=diag.condition_grade,
        status="ACTIVE",
        seller_id=current_user.id,
        liquidity_score=diag.liquidity_score,
        disposition_path=path,
    )
    db.add(material)
    db.flush()
    db.add_all(
        MaterialImage(material_id=material.id, url=url, display_order=idx)
        for idx, url in enumerate(diag.image_urls or [])
    )
    diag.status = triage_service.STATUS_LISTED
    diag.listed_at = datetime.now(timezone.utc)
    diag.material_id = material.id
    db.commit()
    db.refresh(diag)

    from app.ai.services.embedding_hook import update_material_embedding_background
    background_tasks.add_task(update_material_embedding_background, material.id)
    invalidate_material_caches()

    return {
        "status": "success",
        "data": {"diagnosis": triage_service.serialize_diagnosis(diag), "materialId": material.id},
    }
