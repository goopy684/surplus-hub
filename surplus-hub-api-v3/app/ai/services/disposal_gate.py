"""모듈 0 · 거래 전 처분 경로 판별 게이트 (REUSE / RECYCLE / SCRAP).

판매글·시세 LLM 호출 전에 '직거래로 팔릴 자재인가'를 결정적 규칙으로 판정한다.
근거는 모듈 1(Vision AI 상태·파손·소재 신호)과 모듈 2(DB의 유사 매물·체결 거래 실적)이며,
판정 수치는 실제 DB 조회 결과만 쓴다 (지어낸 건수 없음).
"""

import logging
import re
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.ai.services.search import expand_query, get_or_generate_embedding
from app.models.disposal_advisory import DisposalAdvisory
from app.models.material import Material
from app.models.transaction import Transaction
from app.schemas.ai_schemas import (
    DisposalChannel,
    DisposalEvaluateResponse,
    DisposalEvidence,
)

logger = logging.getLogger(__name__)

ROUTES = ("REUSE", "RECYCLE", "SCRAP")
DAMAGE_LEVELS = ("NONE", "MINOR", "SEVERE")
RECYCLABLE_MATERIALS = ("알루미늄", "구리/전선", "스테인리스", "고철/강재", "기타 재활용")

MARKET_STATUSES = ("ACTIVE", "RESERVED", "SOLD")
TRADE_STATUSES = ("CONFIRMED", "COMPLETED")
VECTOR_MIN_SIMILARITY = 0.35
SIMILAR_LIMIT = 20

_MIXED_WASTE_KEYWORDS = ("혼합폐기물", "혼합 폐기물", "건설폐기물", "폐콘크리트", "폐목재 더미", "철거 잔해", "쓰레기")
_SEVERE_KEYWORDS = ("심한 파손", "심한 부식", "침수", "오염 심함", "파손품", "고철용", "폐기용", "깨진", "절단 폐자재")
# 위에서부터 먼저 걸리는 소재 우선
_RECYCLABLE_KEYWORDS = {
    "알루미늄": ("알루미늄", "알미늄", "창호", "샷시", "새시", "샤시", "프로파일"),
    "구리/전선": ("전선", "케이블", "F-CV", "CV케이블", "구리", "동관", "부스바", "나동선"),
    "스테인리스": ("스테인리스", "스텐", "스뎅", "SUS", "STS", "304", "316"),
    "고철/강재": ("철근", "H빔", "H형강", "강관", "아시바", "비계", "클램프", "볼밸브", "주강"),
}
# 유사 매물 키워드 매칭에서 거의 모든 매물에 걸리는 일반 명사는 뺀다
_STOPWORDS = {"자재", "잉여", "잉여자재", "판매", "팝니다", "새제품", "신품", "중고", "일괄", "급처"}

# 처분 경로별 안내에 쓰는 공공 채널 (실재하는 공공 플랫폼만 링크한다)
_CH_RE = DisposalChannel(
    name="한국환경공단 순환자원정보센터",
    description="재활용 가능 자원·처리 업체 정보를 조회할 수 있는 공공 플랫폼입니다.",
    url="https://www.re.or.kr",
)
_CH_ALLBARO = DisposalChannel(
    name="올바로시스템 (건설폐기물 전자인계)",
    description="건설폐기물 5톤 이상 배출 시 배출자 신고·인계서 작성을 하는 한국환경공단 시스템입니다.",
    url="https://www.allbaro.or.kr",
)
_CH_LOCAL = DisposalChannel(
    name="관할 지자체 공사장 생활폐기물 배출",
    description="5톤 미만 공사장 생활폐기물은 시·군·구청 청소행정 부서에 배출 신고 후 처리합니다.",
)
_CH_SCALE = DisposalChannel(
    name="인근 산업단지 비철·고철 계근 매입장",
    description="재질별로 분리해 가져가면 무게(계근) 기준으로 매입합니다. 방문 전 매입 품목과 단가를 전화로 확인하세요.",
)

_SORTING_TIPS = {
    "알루미늄": "유리·고무 가스켓·철 나사 등 이물질을 떼어내면 알루미늄 단일 품목으로 계근할 수 있습니다.",
    "구리/전선": "피복 전선과 피복을 벗긴 동선·동관을 따로 묶어 보관하세요.",
    "스테인리스": "자석을 대어 붙지 않는 스테인리스와 일반 철을 분리하세요.",
    "고철/강재": "철근·강관·형강을 종류·길이별로 묶고 콘크리트·흙 등 이물질을 털어내세요.",
    "기타 재활용": "재질별(금속·플라스틱·목재)로 분리한 뒤 처리 가능 업체를 조회하세요.",
}

OVERRIDE_TO_REUSE_BLOCKED = "혼합 건설폐기물은 법적으로 직거래 매물로 등록할 수 없습니다."
SCRAP_OVERRIDE_NEEDS_REASON = "고철·폐기 판정을 직거래로 바꾸려면 재지정 사유를 선택해야 합니다."


@dataclass
class MarketEvidence:
    similar_active_count: int = 0
    similar_sold_count: int = 0
    completed_trade_count: int = 0
    total_market_count: int = 0

    @property
    def has_trade_evidence(self) -> bool:
        return (self.similar_active_count + self.similar_sold_count + self.completed_trade_count) > 0


def _contains_any(text: str, keywords: Iterable[str]) -> bool:
    upper = text.upper()
    return any(k.upper() in upper for k in keywords)


def normalize_damage_level(raw: Optional[str]) -> str:
    value = str(raw or "").strip().upper()
    return value if value in DAMAGE_LEVELS else "NONE"


def normalize_recyclable_material(raw: Optional[str]) -> Optional[str]:
    value = str(raw or "").strip()
    return value if value in RECYCLABLE_MATERIALS else None


def infer_disposal_signals(
    texts: Iterable[Optional[str]],
    damage_level: Optional[str] = None,
    is_mixed_waste: Optional[bool] = False,
    recyclable_material: Optional[str] = None,
) -> Tuple[str, bool, Optional[str]]:
    """Vision AI 신호를 정규화하고 제목·키워드·태그 문자열로 결정적으로 보강한다.

    Returns (damage_level, is_mixed_waste, recyclable_material).
    """
    text = " ".join(t for t in texts if t)
    damage = normalize_damage_level(damage_level)
    mixed = bool(is_mixed_waste)
    recyclable = normalize_recyclable_material(recyclable_material)

    if _contains_any(text, _MIXED_WASTE_KEYWORDS):
        mixed = True
    if mixed or _contains_any(text, _SEVERE_KEYWORDS):
        damage = "SEVERE"
    if recyclable is None:
        recyclable = next(
            (name for name, kws in _RECYCLABLE_KEYWORDS.items() if _contains_any(text, kws)),
            None,
        )
    return damage, mixed, recyclable


# ---------------------------------------------------------------------------
# 모듈 2 · 유사 매물 / 체결 거래 실적
# ---------------------------------------------------------------------------
def _vector_matches(db: Session, title: str) -> List[Tuple[int, str]]:
    """PostgreSQL + pgvector에서만 임베딩 유사 매물을 찾는다. 실패하면 빈 목록 (키워드 폴백)."""
    if db.bind is None or db.bind.dialect.name != "postgresql" or Material.embedding_vector is None:
        return []
    try:
        embedding = get_or_generate_embedding(title)
        distance = Material.embedding_vector.cosine_distance(embedding)
        rows = (
            db.query(Material.id, Material.status)
            .filter(Material.status.in_(MARKET_STATUSES))
            .filter(Material.embedding_vector.isnot(None))
            .filter((1 - distance) >= VECTOR_MIN_SIMILARITY)
            .order_by(distance)
            .limit(SIMILAR_LIMIT)
            .all()
        )
        return [(r[0], r[1]) for r in rows]
    except Exception:
        logger.warning("disposal gate vector match failed; falling back to keyword match", exc_info=True)
        db.rollback()
        return []


def _keyword_terms(title: str) -> List[str]:
    tokens = [t for t in re.findall(r"[가-힣A-Za-z]{2,}", title) if t not in _STOPWORDS]
    terms: List[str] = []
    for t in [*expand_query(title), *tokens]:
        if t not in terms:
            terms.append(t)
    return terms


def _keyword_matches(db: Session, title: str) -> List[Tuple[int, str]]:
    terms = _keyword_terms(title)
    if not terms:
        return []
    rows = (
        db.query(Material.id, Material.status)
        .filter(Material.status.in_(MARKET_STATUSES))
        .filter(or_(*(Material.title.ilike(f"%{t}%") for t in terms)))
        .order_by(Material.id.desc())
        .limit(SIMILAR_LIMIT)
        .all()
    )
    return [(r[0], r[1]) for r in rows]


def collect_market_evidence(db: Session, title: str) -> MarketEvidence:
    matches = _vector_matches(db, title) or _keyword_matches(db, title)
    ids = [mid for mid, _ in matches]
    completed = 0
    if ids:
        completed = (
            db.query(func.count(Transaction.id))
            .filter(Transaction.material_id.in_(ids))
            .filter(Transaction.status.in_(TRADE_STATUSES))
            .scalar()
            or 0
        )
    total = db.query(func.count(Material.id)).filter(Material.status.in_(MARKET_STATUSES)).scalar() or 0
    return MarketEvidence(
        similar_active_count=sum(1 for _, s in matches if s in ("ACTIVE", "RESERVED")),
        similar_sold_count=sum(1 for _, s in matches if s == "SOLD"),
        completed_trade_count=completed,
        total_market_count=total,
    )


# ---------------------------------------------------------------------------
# 3-Way 판정
# ---------------------------------------------------------------------------
def decide_route(
    condition: Optional[str],
    damage_level: str,
    is_mixed_waste: bool,
    recyclable_material: Optional[str],
    market: MarketEvidence,
) -> Tuple[str, bool, str]:
    """Returns (recommended_route, can_override_to_reuse, reasoning). plan.md 4.2의 Rule 1~8 순서."""
    counts = (
        f"유사 매물 {market.similar_active_count + market.similar_sold_count}건, "
        f"체결 실적 {market.completed_trade_count}건"
    )
    grade = condition or "미정"
    if is_mixed_waste:
        return "SCRAP", False, "여러 자재가 섞인 혼합 건설폐기물로 판단되어 직거래 등록 대상이 아닙니다. 적법 처리 절차를 안내합니다."
    if damage_level == "SEVERE":
        return "SCRAP", True, f"심한 파손·부식·오염이 확인되어 원래 용도로 재사용이 어렵습니다 ({counts})."
    if condition == "하":
        if recyclable_material:
            return "RECYCLE", True, f"상태 등급 하이지만 {recyclable_material} 원소재 가치가 있어 재활용 매각을 권장합니다 ({counts})."
        if not market.has_trade_evidence:
            return "SCRAP", True, f"상태 등급 하이고 원소재 가치와 거래 실적이 확인되지 않습니다 ({counts})."
        return "RECYCLE", True, f"상태 등급 하로 원형 그대로의 직거래보다는 재활용 연계를 권장합니다 ({counts})."
    if market.has_trade_evidence:
        return "REUSE", True, f"상태 등급 {grade}이고 유사 거래 수요가 확인되어 직거래 등록을 진행합니다 ({counts})."
    if market.total_market_count > 0 and condition != "상" and (recyclable_material or damage_level == "MINOR"):
        reason = f"{recyclable_material} 원소재 가치가" if recyclable_material else "경미한 손상이"
        return "RECYCLE", True, f"마켓에 유사 매물·체결 실적이 없고 {reason} 있어 재활용 연계를 권장합니다 ({counts})."
    return "REUSE", True, f"상태 등급 {grade} 및 표준 공종 품목으로 직거래 등록이 가능합니다 (유사 매물 실적 수집 중 · {counts})."


def _guide(route: str, recyclable_material: Optional[str]) -> Tuple[str, List[str], List[DisposalChannel]]:
    """Returns (headline, steps, channels) for the selected route."""
    if route == "REUSE":
        return "직거래 등록 가능", [], []
    if route == "RECYCLE":
        tip = _SORTING_TIPS.get(recyclable_material or "기타 재활용", _SORTING_TIPS["기타 재활용"])
        return (
            "재활용 연계 권장",
            [
                tip,
                "순환자원정보센터에서 지역 재활용·처리 업체를 조회하세요.",
                "인근 산단 비철·고철 매입장에 재질별로 분리해 계근 매각하세요.",
            ],
            [_CH_RE, _CH_SCALE],
        )
    return (
        "직거래 등록 차단 · 고철·폐기 처리",
        [
            "금속(철·비철)과 비금속(콘크리트·목재·플라스틱 등)을 분리하세요.",
            "분리한 금속은 인근 고철 계근 매입장에 매각하세요.",
            "나머지 건설폐기물은 5톤 이상이면 올바로시스템으로 배출자 신고·인계, 5톤 미만이면 관할 지자체에 공사장 생활폐기물로 배출하세요.",
        ],
        [_CH_SCALE, _CH_ALLBARO, _CH_LOCAL],
    )


def to_response(advisory: DisposalAdvisory) -> DisposalEvaluateResponse:
    headline, steps, channels = _guide(advisory.selected_route, advisory.recyclable_material)
    return DisposalEvaluateResponse(
        advisoryId=advisory.id,
        recommendedRoute=advisory.recommended_route,
        selectedRoute=advisory.selected_route,
        canOverrideToReuse=advisory.can_override_to_reuse,
        overrideReason=advisory.override_reason,
        headline=headline,
        reasoning=advisory.reasoning,
        evidence=DisposalEvidence(
            conditionGrade=advisory.condition_grade,
            category=advisory.category,
            damageLevel=advisory.damage_level,
            isMixedWaste=advisory.is_mixed_waste,
            recyclableMaterial=advisory.recyclable_material,
            similarActiveCount=advisory.similar_active_count,
            similarSoldCount=advisory.similar_sold_count,
            completedTradeCount=advisory.completed_trade_count,
        ),
        steps=steps,
        channels=channels,
    )


def evaluate_disposal(
    db: Session,
    *,
    user_id: int,
    title: str,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    tags: Optional[List[str]] = None,
    material_type: Optional[str] = None,
    damage_level: Optional[str] = None,
    is_mixed_waste: bool = False,
    recyclable_material: Optional[str] = None,
) -> DisposalAdvisory:
    """판정하고 disposal_advisories에 기록한다."""
    title = title.strip()
    damage, mixed, recyclable = infer_disposal_signals(
        [title, material_type, *(tags or [])], damage_level, is_mixed_waste, recyclable_material
    )
    condition = condition if condition in ("상", "중", "하") else None
    market = collect_market_evidence(db, title)
    route, can_override, reasoning = decide_route(condition, damage, mixed, recyclable, market)

    advisory = DisposalAdvisory(
        user_id=user_id,
        title=title[:200],
        category=(category or None) and category[:50],
        condition_grade=condition,
        damage_level=damage,
        is_mixed_waste=mixed,
        recyclable_material=recyclable,
        similar_active_count=market.similar_active_count,
        similar_sold_count=market.similar_sold_count,
        completed_trade_count=market.completed_trade_count,
        recommended_route=route,
        selected_route=route,
        can_override_to_reuse=can_override,
        reasoning=reasoning,
    )
    db.add(advisory)
    db.commit()
    db.refresh(advisory)
    return advisory


def override_error(advisory: DisposalAdvisory, selected_route: str, override_reason: Optional[str]) -> Optional[str]:
    """재지정이 허용되지 않으면 사유 메시지, 허용되면 None. PATCH와 매물 등록이 같은 규칙을 쓴다."""
    if selected_route not in ROUTES:
        return f"selectedRoute must be one of: {', '.join(ROUTES)}"
    if selected_route == "REUSE":
        if advisory.is_mixed_waste or not advisory.can_override_to_reuse:
            return OVERRIDE_TO_REUSE_BLOCKED
        if advisory.recommended_route == "SCRAP" and not (override_reason or "").strip():
            return SCRAP_OVERRIDE_NEEDS_REASON
    return None


def apply_override(advisory: DisposalAdvisory, selected_route: str, override_reason: Optional[str]) -> None:
    advisory.selected_route = selected_route
    advisory.override_reason = (override_reason or "").strip() or None
