"""구매 요청(구해요/RFQ) 매칭·직렬화.

매칭은 triage 수요 매칭과 같은 키워드 규칙(_wanted_terms·_matches)과 반경(_within)만 쓴다 — 외부 호출 0.
대상 매물은 ACTIVE + 공개 트랙(B/C 제외)만, 요청자 본인 매물은 제외한다.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.ai.services.triage import (
    CANDIDATE_LIMIT, NOTIFY_INTERVAL, _aware, _matches, _now, _wanted_terms, _within,
)
from app.core.notify import notify
from app.models.material import PUBLIC_TRACK_FILTER, Material
from app.models.wanted import WantedRequest, open_wanted

logger = logging.getLogger(__name__)

MATCH_LIMIT = 10


def _is_public(m: Material) -> bool:
    return m.status == "ACTIVE" and m.disposition_path not in ("B", "C")


def _wants(w: WantedRequest, terms: list[str], m: Material) -> bool:
    """요청 w가 매물 m을 원하는지: 본인 매물 아님 + 요청 반경 안 + 품목 용어 일치."""
    return (
        m.seller_id != w.user_id
        and m.location_lat is not None and m.location_lng is not None
        and _within(w.location_lat, w.location_lng, m.location_lat, m.location_lng, w.radius_km)
        and _matches(terms, f"{m.title} {m.description}")
    )


def find_matches(db: Session, w: WantedRequest, limit: int = MATCH_LIMIT) -> list[Material]:
    """상세 화면의 매칭 매물 (조회 시 계산, 최신순)."""
    terms = _wanted_terms(w.title, w.description)
    if not terms:
        return []
    # ponytail: 키워드가 맞는 최신 CANDIDATE_LIMIT건만 파이썬으로 거리 계산. 매물이 많아지면 좌표 격자 인덱스/PostGIS로 교체
    rows = (
        db.query(Material)
        .options(joinedload(Material.seller), selectinload(Material.material_images))
        .filter(Material.status == "ACTIVE", PUBLIC_TRACK_FILTER, Material.seller_id != w.user_id)
        .filter(Material.location_lat.isnot(None), Material.location_lng.isnot(None))
        .filter(or_(*(c.ilike(f"%{t}%") for t in terms for c in (Material.title, Material.description))))
        .order_by(Material.id.desc())
        .limit(CANDIDATE_LIMIT)
        .all()
    )
    return [m for m in rows if _wants(w, terms, m)][:limit]


def _due(w: WantedRequest, now: datetime) -> bool:
    notified_at = _aware(w.last_notified_at)
    return (
        w.status == "OPEN" and _aware(w.expires_at) > now
        and (notified_at is None or now - notified_at >= NOTIFY_INTERVAL)
    )


def match_wanted_for_material(db: Session, material_id: int) -> int:
    """매물이 공개되면 반경 안의 열린 요청자에게 WANTED_MATCH를 보낸다. 요청자당 1건, 요청당 24시간 1회. 알림 수 반환."""
    m = db.get(Material, material_id)
    if m is None or not _is_public(m) or m.location_lat is None or m.location_lng is None:
        return 0
    now = _now()
    material_title = m.title
    # ponytail: 최신 CANDIDATE_LIMIT건의 열린 요청만 본다. 요청이 많아지면 카테고리·좌표 격자로 후보를 줄인다
    rows = (
        db.query(WantedRequest)
        .filter(open_wanted(now), WantedRequest.user_id != m.seller_id)
        .order_by(WantedRequest.id.desc())
        .limit(CANDIDATE_LIMIT)
        .all()
    )
    by_user: dict[int, list[int]] = {}
    for w in rows:
        if _wants(w, _wanted_terms(w.title, w.description), m):
            by_user.setdefault(w.user_id, []).append(w.id)

    sent = 0
    for user_id, ids in by_user.items():
        # 동시에 공개된 매물 두 건이 같은 요청을 함께 알리지 않게, 잠근 뒤 최신 행으로 다시 판단한다
        # (triage 보관함 알림과 같은 방식. Postgres는 먼저 잡은 쪽이 커밋할 때까지 대기)
        locked = (
            db.query(WantedRequest).filter(WantedRequest.id.in_(ids))
            .order_by(WantedRequest.id.desc())
            .populate_existing().with_for_update().all()
        )
        due = [w for w in locked if _due(w, now)]
        if not due:
            db.commit()  # 잠금 해제
            continue
        for w in due:
            w.last_notified_at = now
        rep = due[0]  # 한 사람의 여러 요청이 맞으면 가장 최근 요청 하나로 알린다
        # notify가 커밋한다(잠금 해제). 실패하면 롤백되어 위 알림 표시도 함께 취소된다.
        if notify(
            db,
            user_id=user_id,
            type="WANTED_MATCH",
            title="찾던 자재가 올라왔어요",
            body=f"'{rep.title}'에 맞는 매물: {material_title}",
            reference_type="wanted",
            reference_id=rep.id,
            data={"materialId": material_id},
        ) is not None:
            sent += 1
    db.commit()
    return sent


def match_wanted_for_material_background(bind, material_id: int) -> int:
    """응답 뒤 자체 세션으로 실행. 실패는 조용히 무시.

    bind는 요청 세션의 엔진이다. SessionLocal을 직접 쓰면 테스트에서 닿지 않는 DB 호스트로
    접속을 시도해 요청이 DNS 타임아웃만큼 멈춘다 (EXPERIENCE 2026-11-15).
    """
    db = Session(bind=bind)
    try:
        return match_wanted_for_material(db, material_id)
    except Exception:
        db.rollback()
        logger.debug("구매 요청 매칭 실패", exc_info=True)
        return 0
    finally:
        db.close()


def enqueue_match(background_tasks, db: Session, material: Material) -> None:
    """매물이 ACTIVE면 응답 뒤 매칭을 건다 (공개 트랙 여부는 매칭에서 다시 본다)."""
    if material.status == "ACTIVE":
        background_tasks.add_task(match_wanted_for_material_background, db.get_bind(), material.id)


# ---------------------------------------------------------------------------
# 응답 직렬화 (계약 plan 3.6)
# ---------------------------------------------------------------------------
def _iso(dt: Optional[datetime]) -> Optional[str]:
    dt = _aware(dt)
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def serialize_wanted(w: WantedRequest, now: datetime) -> dict:
    """만료된 OPEN은 응답에서만 EXPIRED로 내려준다 (저장값은 그대로)."""
    status = "EXPIRED" if w.status == "OPEN" and _aware(w.expires_at) <= now else w.status
    u = w.user
    return {
        "id": w.id,
        "title": w.title,
        "description": w.description,
        "category": w.category,
        "quantity": w.quantity,
        "quantityUnit": w.quantity_unit,
        "budgetMax": w.budget_max,
        "location": {"address": w.location_address, "lat": w.location_lat, "lng": w.location_lng},
        "radiusKm": w.radius_km,
        "status": status,
        "expiresAt": _iso(w.expires_at),
        "createdAt": _iso(w.created_at),
        "requester": {"id": u.id, "name": u.name, "avatarUrl": u.avatar_url, "trustLevel": u.trust_level}
        if u else None,
    }
