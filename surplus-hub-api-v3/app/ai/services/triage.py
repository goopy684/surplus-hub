"""거래 전 AI 유동성 진단 (Pre-Transaction Triage) 서비스.

LLM(Vision)은 칩이 비었을 때 사진을 읽는 데만 쓰고, 점수·가격·경로는 전부 규칙과 DB 통계로
결정론적으로 계산한다. 산식·임계값은 docs/2026-11-15_거래전_AI진단_및_리텐션강화_실행계획.md 1.4/1.5.
"""

import hashlib
import logging
import math
import re
import secrets
import statistics
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.ai.services.registration import analyze_material_image, parse_keyword
from app.core.cache import cache_get_json, cache_set_json
from app.core.config import settings
from app.core.notify import notify
from app.crud.crud_category import TRADE_CATEGORIES
from app.models.material import Material
from app.models.search_log import SearchLog
from app.models.triage import AiTriageDiagnosis
from app.models.wanted import WantedRequest, open_wanted

logger = logging.getLogger(__name__)

DAILY_LIMIT = 30  # 사용자당 롤링 24시간 진단 상한 (Vision 과금 어뷰징 방지)
RADIUS_KM = 10.0
SEARCH_WINDOW_DAYS = 30
SIMILAR_WINDOW_DAYS = 90
HOT_WINDOW_DAYS = 14
# ponytail: 최신 N건만 파이썬으로 거리 계산. 로그가 많아지면 좌표 격자 인덱스/PostGIS로 교체
CANDIDATE_LIMIT = 500
HOT_CANDIDATE_LIMIT = 2000
HOT_FREE_TEXT_MIN_COUNT = 3
PRIOR_WEIGHT = 5
NOTIFY_DELTA = 10
NOTIFY_INTERVAL = timedelta(hours=24)
# 열린 구매 요청 1건 = 검색 3건. 검색은 의도가 불분명하지만 요청은 "이걸 사겠다"는 명시적 수요다
# ponytail: 보정 전 상수. 요청→체결 전환 데이터가 쌓이면 검색 대비 실측 비율로 교체
WANTED_WEIGHT = 3
VISION_CACHE_PREFIX = "ai:triage:vision"
VISION_CACHE_TTL = 24 * 3600

STATUS_DIAGNOSED = "DIAGNOSED"
STATUS_VAULT = "VAULT_SAVED"
STATUS_LISTED = "LISTED_MATERIAL"

# 진단은 두 축으로 본다.
#   품목(업종 카테고리) → 재사용 수요의 기본값(prior).  "무엇인가"
#   소재              → 고철 단가와 소재 가치 보너스.     "무엇으로 만들었나"
# 한 축에 묶으면 소재 목록에 없는 완제품(LED 평판등·밸브·타일)이 상태가 좋아도 A에 못 간다.
#
# ponytail: 품목별 prior는 현장 검증 전 초기 가정값. 체결 데이터가 쌓이면 품목×지역 실측 체결률로 교체
CATEGORY_PRIORS: dict[str, float] = {
    "설비": 0.65, "조명": 0.60, "전기": 0.60, "건축자재": 0.55, "문/창호": 0.40, "기타": 0.35,
}
assert set(CATEGORY_PRIORS) == set(TRADE_CATEGORIES), "업종 카테고리 시드와 어긋남"

# 규격 메모에서 품목을 추정하는 단어 (칩을 안 골랐을 때만). 위에서부터 먼저 걸리는 쪽 우선.
# registration._normalize_category는 Vision 출력 정규화용이라 "문" 한 글자로도 걸린다("주문", "문의") — 자유 텍스트에는 쓰지 않는다.
_CATEGORY_HINTS: dict[str, tuple[str, ...]] = {
    "설비": ("배관", "파이프", "밸브", "피팅", "플랜지", "엘보", "펌프", "위생", "보일러"),
    "조명": ("조명", "led", "평판등", "투광등", "등기구"),  # "램프"는 "클램프"에 걸려서 뺐다
    "전기": ("전선", "케이블", "차단기", "배선", "분전", "콘센트", "스위치", "전기"),
    "건축자재": (
        "철근", "시멘트", "목재", "타일", "단열재", "페인트", "합판", "석고보드", "벽돌", "h빔", "각재",
        "각관", "앵글", "판재", "프로파일", "클램프", "비계", "유로폼", "방부목", "아이소핑크",
    ),
    "문/창호": ("창호", "샷시", "새시", "방화문", "출입문", "도어", "문짝", "유리문"),
}

# ponytail: 고철 단가(원/kg)·소재 가치는 코드 상수 초기 가정값. 시세 연동/관리자 갱신 화면이 생기면 DB로 이전.
# 순서가 곧 판별 우선순위다 (구체적인 것 먼저: 316·430 → 304, 리튬 → 납축 배터리 → 납).
MATERIALS: dict[str, dict] = {
    "copper": {"label": "구리(동)", "scrap": 9000, "value": 1.0,
               "aliases": ("구리", "동판", "동관", "동파이프", "동선", "나동선", "동스크랩", "copper")},
    "brass": {"label": "황동(신주)", "scrap": 5500, "value": 0.85,
              "aliases": ("황동", "신주", "brass")},
    "carbide": {"label": "초경(텅스텐 카바이드)", "scrap": 25000, "value": 1.0,
                "aliases": ("초경", "텅스텐", "카바이드", "carbide", "tungsten")},
    "nickel": {"label": "니켈합금", "scrap": 12000, "value": 1.0,
               "aliases": ("니켈", "인코넬", "모넬", "하스텔로이", "inconel", "monel", "hastelloy", "nickel")},
    "titanium": {"label": "티타늄", "scrap": 4000, "value": 0.80,
                 "aliases": ("티타늄", "티탄", "titanium")},
    "sus316": {"label": "스테인리스 SUS316", "scrap": 2300, "value": 0.80,
               "aliases": ("sus316", "sus 316", "스텐316", "스텐 316", "316스텐", "316 스텐", "316l")},
    "sus430": {"label": "스테인리스 SUS430(자성)", "scrap": 500, "value": 0.35,
               "aliases": ("sus430", "sus 430", "스텐430", "스텐 430", "430스텐", "430 스텐", "자성 스텐", "자성스텐")},
    "sus304": {"label": "스테인리스 SUS304", "scrap": 1400, "value": 0.70,
               "aliases": ("sus304", "sus 304", "304 스텐", "스텐", "스테인리스", "스테인레스", "서스", "sus")},
    "aluminum": {"label": "알루미늄", "scrap": 1800, "value": 0.70,
                 "aliases": ("알루미늄", "알미늄", "aluminum", "aluminium")},
    "wire": {"label": "전선·케이블(피복)", "scrap": 3000, "value": 0.75,
             "aliases": ("전선", "케이블", "cable")},
    # 리튬은 납축과 가격도 취급 규제도 다르다 — 한 키로 묶지 않는다
    "battery_li": {"label": "리튬 배터리", "scrap": 300, "value": 0.30,
                   "aliases": ("리튬", "lithium")},
    "battery": {"label": "납축 배터리", "scrap": 600, "value": 0.50,
                "aliases": ("납축", "축전지", "배터리", "battery")},
    "lead": {"label": "납", "scrap": 2000, "value": 0.60,
             "aliases": ("납괴", "납판", "연판", "납 스크랩", "lead")},
    "cast_iron": {"label": "주철", "scrap": 350, "value": 0.20,
                  "aliases": ("주철", "주물", "cast iron")},
    "steel": {"label": "철·강재", "scrap": 300, "value": 0.20,
              "aliases": ("철근", "h빔", "각관", "철판", "강관", "앵글", "고철", "스틸", "steel", "형강", "아연도금")},
    "nonmetal": {"label": "비금속(목재·타일·보드 등)", "scrap": 0, "value": 0.0,
                 "aliases": ("목재", "합판", "각재", "타일", "석고보드", "단열재", "아이소핑크", "유로폼", "pvc")},
}
UNKNOWN = {"label": "소재 미상", "scrap": 20, "value": 0.05, "aliases": ()}

CONDITION_FACTOR = {"상": 1.0, "중": 0.85, "하": 0.5}
CONDITION_RANK = {"상": 0, "중": 1, "하": 2}
SCRAP_MULTIPLIER = {"상": 3.0, "중": 2.0, "하": 1.3}
BASE_PRICE_FACTOR = {"상": 1.0, "중": 0.7, "하": 0.4}
BASE_DIRECT_PRICE = 150_000
WASTE_BASE = 100_000
WASTE_PER_KG = 250
# 금액 컬럼이 Integer(약 21억)다. 구리 상 등급 기준 9,000원 × 3배 × 50톤 = 13.5억이 상한
MAX_WEIGHT_KG = 50_000
# 초경(25,000원/kg)처럼 단가가 높은 소재는 50톤이면 정수 범위를 넘는다 — 금액 자체도 자른다
MAX_AMOUNT = 2_000_000_000
PATH_A_MIN = 70
PATH_B_MIN = 30

PATH_LABELS = {"A": "원형 재사용 직거래", "B": "소재 매입 호가 비딩", "C": "중량 일괄 처분"}

# 치수 표기 (50A, 12T, 2.5SQ, 30mm, 100x100 ...) — 소문자 텍스트에 적용
_DIMENSION_RE = re.compile(
    r"\d+(?:\.\d+)?\s*(?:mm|cm|sq|a|t|파이|각|φ|ø)(?![a-z])|\d+(?:\.\d+)?\s*[x×*]\s*\d+"
)
_KS_RE = re.compile(r"(?<![a-z])ks\s*[a-z]?\s*\d")
_TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣]+")
_TERM_STOPWORDS = frozenset({
    "미개봉", "미사용", "새제품", "신품", "중고", "사용감", "판매", "팝니다", "처분", "정리", "급처",
    "자재", "잉여", "재고", "남은", "여분", "묶음", "박스", "세트", "정도", "ks",
})


# ---------------------------------------------------------------------------
# 파싱
# ---------------------------------------------------------------------------
def _alias_in(alias: str, text: str) -> bool:
    """영문 별칭은 더 긴 영단어 안에서 걸리지 않게(sus ≠ suspension) 경계를 본다. text는 소문자."""
    if alias.isascii():
        # 글자로 끝나는 쪽만 경계를 본다: "sus316"은 "sus316l"에 걸리고 "sus"는 "suspension"에 안 걸린다
        before = "(?<![a-z])" if alias[0].isalpha() else ""
        after = "(?![a-z])" if alias[-1].isalpha() else ""
        return re.search(f"{before}{re.escape(alias)}{after}", text) is not None
    return alias in text


def detect_material(text: Optional[str]) -> Optional[str]:
    """텍스트에서 소재 키를 찾는다. MATERIALS 순서대로(구체적인 것 먼저) 첫 일치."""
    lowered = (text or "").lower()
    if not lowered.strip():
        return None
    for key, mat in MATERIALS.items():
        if any(_alias_in(a, lowered) for a in mat["aliases"]):
            return key
    return None


def _matches(terms: list[str], text: Optional[str]) -> bool:
    """SQL ILIKE 후보를 detect_material과 같은 경계 규칙으로 다시 거른다."""
    lowered = (text or "").lower()
    return any(_alias_in(t.lower(), lowered) for t in terms)


def infer_category(text: Optional[str]) -> str:
    """규격 메모에서 업종 카테고리를 추정한다. 못 찾으면 "기타"."""
    lowered = (text or "").lower()
    for category, hints in _CATEGORY_HINTS.items():
        if any(_alias_in(h, lowered) for h in hints):
            return category
    return "기타"


def _prior(category: Optional[str]) -> float:
    return CATEGORY_PRIORS.get(category or "", CATEGORY_PRIORS["기타"])


def _material(key: Optional[str]) -> dict:
    return MATERIALS.get(key or "", UNKNOWN)


def _worse_grade(a: Optional[str], b: Optional[str]) -> Optional[str]:
    """두 등급 중 나쁜 쪽 (상태 부풀리기 방지). 한쪽만 있으면 그 값."""
    grades = [g for g in (a, b) if g in CONDITION_RANK]
    return max(grades, key=CONDITION_RANK.get) if grades else None


def _spec_clarity(
    identified: bool, text: str, label_text: Optional[str], quantity: Optional[int],
) -> float:
    """identified = 품목(기타 제외)이나 소재 중 하나라도 식별됐는지."""
    lowered = text.lower()
    signals = 0.0
    signals += 1 if identified else 0
    signals += 1 if _DIMENSION_RE.search(lowered) else 0
    signals += 1 if ((label_text or "").strip() or _KS_RE.search(lowered)) else 0
    signals += 0.5 if quantity else 0
    return min(1.0, signals / 3)


def _demand_terms(material_key: Optional[str], title: Optional[str], spec_text: Optional[str]) -> list[str]:
    """수요 매칭 용어. 소재를 알면 별칭만, 모르면 제목·규격의 유의미한 토큰 최대 5개.

    ponytail: 소재를 아는 품목은 형태(배관/판재)를 구분하지 않는 소재 단위 수요다.
    "파이프"·"미사용" 같은 토큰을 OR로 섞으면 무관한 검색까지 수요로 잡히므로 뺐다. 형태별 수요는 산업분류코드 도입 때.
    """
    mat = _material(material_key)
    # 비금속은 목재·타일·보드를 한데 묶은 키라 별칭으로 맞추면 타일이 목재 검색까지 수요로 센다
    if mat["aliases"] and material_key != "nonmetal":
        return list(mat["aliases"])
    source = spec_text or ""
    if title and title != mat["label"]:  # 라벨로 채운 제목("소재 미상")은 수요 근거가 아니다
        source = f"{title} {source}"
    # 숫자로 시작하는 토큰(50A, 20개, 640x640)과 상태·거래 표현은 품목을 가리지 못한다
    tokens = [
        t for t in _TOKEN_RE.findall(source)
        if len(t) >= 2 and not t[0].isdigit() and t.lower() not in _TERM_STOPWORDS
    ]
    return list(dict.fromkeys(tokens))[:5]


def _wanted_material(title: str, description: Optional[str]) -> Optional[str]:
    return detect_material(f"{title} {description or ''}")


def _wanted_terms(title: str, description: Optional[str]) -> list[str]:
    """구매 요청의 매칭 용어. 소재는 제목·설명에서 찾고, 그 밖의 토큰은 제목에서만 뽑는다.

    설명의 "바로 수령 가능" 같은 문구가 토큰이 되면 무관한 매물까지 맞아 알림이 샌다.
    """
    return _demand_terms(_wanted_material(title, description), title, None)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(min(1.0, math.sqrt(a)))


def _within(lat, lng, other_lat, other_lng, radius_km: float = RADIUS_KM) -> bool:
    return _haversine_km(lat, lng, other_lat, other_lng) <= radius_km


def _log_weight(row, lat, lng, radius_km: float = RADIUS_KM) -> float:
    """검색 로그 가중치: 요청 좌표 없음 0.5 / 로그 좌표 없음 0.3 / 반경 내 1.0 / 반경 밖 0."""
    if lat is None or lng is None:
        return 0.5
    if row.location_lat is None or row.location_lng is None:
        return 0.3
    return 1.0 if _within(lat, lng, row.location_lat, row.location_lng, radius_km) else 0.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite는 naive datetime을 돌려준다 — UTC로 간주."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------------------
# 수요 근거 (검색 로그 + 유사 매물)
# ---------------------------------------------------------------------------
def _fetch_logs(db: Session, since: datetime, terms: Optional[list[str]] = None, limit: int = CANDIDATE_LIMIT):
    q = db.query(SearchLog.query, SearchLog.location_lat, SearchLog.location_lng).filter(
        SearchLog.created_at >= since
    )
    if terms is not None:
        if not terms:
            return []
        q = q.filter(or_(*(SearchLog.query.ilike(f"%{t}%") for t in terms)))
    return q.order_by(SearchLog.id.desc()).limit(limit).all()


def _open_wanted(db: Session, now: datetime, terms: Optional[list[str]] = None, limit: int = CANDIDATE_LIMIT):
    """열린 구매 요청 (검색 로그처럼 최신 N건만). terms가 빈 목록이면 빈 or_()를 만들지 않고 바로 []."""
    q = db.query(
        WantedRequest.user_id, WantedRequest.title, WantedRequest.description,
        WantedRequest.location_lat, WantedRequest.location_lng, WantedRequest.radius_km,
    ).filter(open_wanted(now))
    if terms is not None:
        if not terms:
            return []
        q = q.filter(or_(*(c.ilike(f"%{t}%") for t in terms for c in (WantedRequest.title, WantedRequest.description))))
    return q.order_by(WantedRequest.id.desc()).limit(limit).all()


_SIMILAR_STATUSES = ("ACTIVE", "RESERVED", "SOLD")  # HIDDEN·REVIEWING 제외


def _similar_materials(db: Session, terms: list[str], since: datetime):
    """수요 근거용 유사 매물 — 키워드 일치만. 보관함 재산정마다 불리므로 외부 호출이 없어야 한다."""
    if not terms:
        return []
    rows = (
        db.query(
            Material.id, Material.status, Material.price, Material.location_lat, Material.location_lng,
            Material.title, Material.description,
        )
        .filter(Material.created_at >= since, Material.status.in_(_SIMILAR_STATUSES))
        .filter(or_(*(c.ilike(f"%{t}%") for t in terms for c in (Material.title, Material.description))))
        .order_by(Material.id.desc())
        .limit(CANDIDATE_LIMIT)
        .all()
    )
    return [r for r in rows if _matches(terms, f"{r.title} {r.description}")]


def _vector_neighbour_prices(db: Session, query_text: str, since: datetime, exclude_ids: set) -> list[int]:
    """진단 시 1회, 직거래 가격 비교군만 pgvector 이웃으로 보강한다 (Postgres 전용, SQLite 테스트 미검증 경로).

    수요 점수에는 쓰지 않는다 — 재산정 때마다 임베딩을 만들면 '재산정 0원'이 깨지고,
    진단 시점과 재산정 시점의 근거가 달라져 점수가 이유 없이 움직인다.
    """
    if db.get_bind().dialect.name != "postgresql" or not query_text.strip():
        return []
    try:
        from app.ai.services.search import get_or_generate_embedding

        embedding = get_or_generate_embedding(query_text)
        distance = Material.embedding_vector.cosine_distance(embedding)
        with db.begin_nested():  # 실패해도 세션을 오염시키지 않게 SAVEPOINT 안에서
            # ponytail: 유사도 0.6 고정 문턱. 체결 데이터로 보정 전 임시값
            rows = (
                db.query(Material.id, Material.price)
                .filter(Material.created_at >= since, Material.status.in_(_SIMILAR_STATUSES))
                .filter(Material.embedding_vector.isnot(None), (1 - distance) >= 0.6)
                .order_by(distance)
                .limit(20)
                .all()
            )
        return [r.price for r in rows if r.id not in exclude_ids and (r.price or 0) > 0]
    except Exception:
        logger.debug("triage pgvector 가격 비교군 보강 실패 — 키워드 결과만 사용", exc_info=True)
        return []


def _demand_evidence(
    db: Session, *, material_key, title, spec_text, lat, lng, exclude_material_id=None, exclude_user_id=None,
) -> dict:
    now = _now()
    terms = _demand_terms(material_key, title, spec_text)
    logs = [r for r in _fetch_logs(db, now - timedelta(days=SEARCH_WINDOW_DAYS), terms) if _matches(terms, r.query)]
    weights = [w for w in (_log_weight(r, lat, lng) for r in logs) if w > 0]
    # 구매 요청은 요청자가 정한 반경 안이면 수요다 (매칭 알림과 같은 기준)
    # 같은 요청자의 요청 여러 건은 1명으로 센다 (상한 안에서 같은 요청을 반복 등록해 점수를 올리지 못하게).
    # 요청 쪽은 매칭 알림과 같은 용어(_wanted_terms)로 맞춘다 — 설명의 "바로 수령 가능"이 무관한 진단의 수요가 되지 않게.
    # 진단 주인 본인의 요청은 수요가 아니다
    by_requester: dict[int, float] = {}
    for r in _open_wanted(db, now, terms):
        if r.user_id == exclude_user_id:
            continue
        hit = _matches(terms, " ".join(_wanted_terms(r.title, r.description)))
        w = _log_weight(r, lat, lng, r.radius_km) if hit else 0
        if w > 0:
            by_requester[r.user_id] = max(w, by_requester.get(r.user_id, 0))
    wanted_weights = list(by_requester.values())

    similar = _similar_materials(db, terms, now - timedelta(days=SIMILAR_WINDOW_DAYS))
    # 이 진단에서 전환된 매물 자신은 근거에서 뺀다 — 넣으면 등록하자마자 "안 팔린 매물"로 세어 점수가 내려간다
    similar = [r for r in similar if r.id != exclude_material_id]
    if lat is not None and lng is not None:
        similar = [
            r for r in similar
            if r.location_lat is not None and r.location_lng is not None
            and _within(lat, lng, r.location_lat, r.location_lng)
        ]
    return {
        "searches": sum(weights) + WANTED_WEIGHT * sum(wanted_weights),
        "search_count": len(weights),
        "wanted_count": len(wanted_weights),
        "sold": sum(1 for r in similar if r.status == "SOLD"),
        "active": sum(1 for r in similar if r.status in ("ACTIVE", "RESERVED")),
        "prices": [r.price for r in similar if (r.price or 0) > 0],
        "similar_ids": {r.id for r in similar},
    }


# ---------------------------------------------------------------------------
# 산식 (1.4)
# ---------------------------------------------------------------------------
def _demand_density(prior: float, searches: float, sold: int, active: int) -> tuple[float, bool]:
    """체결 이력은 prior를 양방향으로 수축하고(Cold-Start 보정), 검색 수요는 올리는 쪽으로만 반영한다.

    검색을 같은 수축식에 넣으면 prior가 높은 소재(구리·SUS)는 검색이 쌓일수록 점수가 내려간다.
    """
    listings = sold + active
    base = (sold + PRIOR_WEIGHT * prior) / (listings + PRIOR_WEIGHT)
    d = base + (1 - base) * 0.6 * min(1.0, searches / 10)
    return d, searches + listings < 3


def _score(condition: float, spec: float, material_value: float, d: float) -> dict:
    demand = 0.45 + 0.55 * d
    reuse = 100 * condition * spec * demand
    bonus = material_value * 30 * (1 - reuse / 100)
    return {"score": round(min(100, reuse + bonus)), "reuse": reuse, "bonus": bonus}


def _path(score: int) -> str:
    return "A" if score >= PATH_A_MIN else ("B" if score >= PATH_B_MIN else "C")


def _match_probability(score: int, cold_start: bool) -> int:
    # ponytail: 점수의 단조 변환 휴리스틱. 체결 데이터가 쌓이면 실제 소진일 분포로 교체
    return int(max(3, min(95, round(score * 0.95 - (5 if cold_start else 0)))))


def _expected_days(score: int, path: str) -> int:
    if path == "A":
        return round(3 + (100 - score) * 0.3)
    return 2 if path == "B" else 1


def _apply_score(diag: AiTriageDiagnosis, evidence: dict, *, update_path: bool) -> None:
    """저장된 인자(condition/spec/materialValue) + 새 수요 근거로 점수 필드를 갱신."""
    bd = dict(diag.score_breakdown or {})
    d, cold = _demand_density(_prior(diag.category), evidence["searches"], evidence["sold"], evidence["active"])
    s = _score(bd["condition"], bd["spec"], bd["materialValue"], d)
    path = _path(s["score"]) if update_path else diag.disposition_path

    bd.update({
        "demand": round(d, 3),
        "reuseScore": round(s["reuse"], 1),
        "materialBonus": round(s["bonus"], 1),
        "searchCount": evidence["search_count"],
        "wantedCount": evidence["wanted_count"],
        "similarActiveCount": evidence["active"],
        "similarSoldCount": evidence["sold"],
    })
    diag.score_breakdown = bd
    diag.liquidity_score = s["score"]
    diag.cold_start = cold
    diag.match_probability = _match_probability(s["score"], cold)
    diag.disposition_path = path
    diag.expected_days = _expected_days(s["score"], path)


# ---------------------------------------------------------------------------
# Vision (조건부, 24h 캐시)
# ---------------------------------------------------------------------------
def _vision_available() -> bool:
    return bool(settings.use_vertex or settings.use_openrouter or settings.GOOGLE_AI_API_KEY)


def _is_uploaded_url(url: str) -> bool:
    """우리 업로드 스토리지 URL인지. Vision은 서버가 URL을 직접 내려받으므로 임의 URL을 넘기면 SSRF가 된다."""
    prefixes = [f"{settings.BASE_URL.rstrip('/')}/static/uploads/"]
    if settings.STORAGE_PUBLIC_BASE_URL:
        prefixes.append(f"{settings.STORAGE_PUBLIC_BASE_URL.rstrip('/')}/")
    if settings.AWS_S3_BUCKET_NAME:
        prefixes.append(f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_S3_REGION}.amazonaws.com/")
    return url.startswith(tuple(prefixes))


def _vision_analyze(image_url: str, keyword: Optional[str]) -> tuple[Optional[dict], str]:
    # 분석 결과(제목·소재)는 키워드에 따라 달라지므로 키에 함께 넣는다
    digest = hashlib.sha256(f"{image_url}\n{keyword or ''}".encode()).hexdigest()
    key = f"{VISION_CACHE_PREFIX}:{digest}"
    cached = cache_get_json(key)
    if cached is not None:
        return cached, "vision_cached"
    try:
        result = analyze_material_image(image_url, keyword=keyword or None).model_dump()
    except Exception:
        logger.warning("triage Vision 실패 — 규칙 기반으로 진단", exc_info=True)
        return None, "rule_based"
    cache_set_json(key, result, ttl_seconds=VISION_CACHE_TTL)
    return result, "vision"


# ---------------------------------------------------------------------------
# 진단 생성
# ---------------------------------------------------------------------------
def count_recent(db: Session, user_id: int) -> int:
    since = _now() - timedelta(hours=24)
    return db.query(func.count(AiTriageDiagnosis.id)).filter(
        AiTriageDiagnosis.user_id == user_id, AiTriageDiagnosis.created_at >= since
    ).scalar() or 0


def _weight_kg(weight_kg, quantity, quantity_unit) -> tuple[float, bool]:
    if weight_kg:
        return min(float(weight_kg), MAX_WEIGHT_KG), False
    unit = (quantity_unit or "").strip().lower()
    if quantity and unit in ("kg", "톤"):
        return min(float(quantity) * (1000 if unit == "톤" else 1), MAX_WEIGHT_KG), False
    return 100.0, True


def diagnose(db: Session, user, payload) -> AiTriageDiagnosis:
    spec_text = (payload.spec_text or "").strip()
    analysis_text = " ".join(x for x in (spec_text, (payload.label_text or "").strip()) if x)
    material_key = payload.material_key or detect_material(analysis_text)
    grade = payload.condition_grade

    vision, mode = None, "rule_based"
    if (
        payload.image_urls
        and (payload.material_key is None or grade is None)
        and _is_uploaded_url(payload.image_urls[0])
        and _vision_available()
    ):
        vision, mode = _vision_analyze(payload.image_urls[0], analysis_text[:100])
    if vision:
        if material_key is None:
            material_key = detect_material(" ".join(
                [vision.get("material_type") or "", vision.get("title_suggestion") or "", *(vision.get("tags") or [])]
            ))
        grade = _worse_grade(grade, vision.get("condition"))

    mat = _material(material_key)
    title = ((vision or {}).get("title_suggestion") or spec_text[:40] or mat["label"]).strip()
    # 품목: 사용자 칩 > Vision(이미 업종 카테고리로 정규화됨) > 메모에서 추정
    category = payload.category or (vision or {}).get("category") or infer_category(f"{title} {analysis_text}")
    # 수량 칸이 비었으면 메모의 "20개"·"5박스"를 읽는다 (등록 화면과 같은 파서)
    quantity, quantity_unit = payload.quantity, payload.quantity_unit
    if not quantity:
        _, parsed_qty, parsed_unit = parse_keyword(spec_text)
        # "6m 15본"의 6m는 길이 규격이지 수량이 아니다. 메모에서는 길이(m)를 수량으로 읽지 않는다
        if parsed_unit != "m":
            quantity, quantity_unit = parsed_qty, parsed_unit or quantity_unit
    spec_factor = 0.6 + 0.4 * _spec_clarity(
        bool(material_key) or category != "기타", analysis_text, payload.label_text, quantity,
    )
    weight, weight_estimated = _weight_kg(payload.weight_kg, quantity, quantity_unit)

    evidence = _demand_evidence(
        db, material_key=material_key, title=title, spec_text=analysis_text, lat=payload.lat, lng=payload.lng,
        exclude_user_id=user.id,
    )

    # 폐기손실 비교 (1.5)
    mixed_waste = -round(WASTE_BASE + WASTE_PER_KG * weight)
    scrap = min(round(mat["scrap"] * weight), MAX_AMOUNT)
    prices = evidence["prices"] + _vector_neighbour_prices(
        db, f"{title} {analysis_text}", _now() - timedelta(days=SIMILAR_WINDOW_DAYS), evidence["similar_ids"],
    )
    if len(prices) >= 3:
        direct, price_basis = round(statistics.median(prices)), "similar_listings"
    else:
        direct = round(max(
            scrap * SCRAP_MULTIPLIER.get(grade, 2.0),
            BASE_DIRECT_PRICE * BASE_PRICE_FACTOR.get(grade, 0.7),
        ))
        price_basis = "category_default"
    direct = min(direct, MAX_AMOUNT)

    diag = AiTriageDiagnosis(
        user_id=user.id,
        status=STATUS_DIAGNOSED,
        title=title[:100],
        category=category,
        material_key=material_key,
        condition_grade=grade,
        spec_text=analysis_text or None,  # 규격 + 라벨 문구
        image_urls=list(payload.image_urls or []),
        quantity=quantity,
        quantity_unit=quantity_unit,
        weight_kg=weight,
        weight_estimated=weight_estimated,
        location_address=payload.location_address,
        location_lat=payload.lat,
        location_lng=payload.lng,
        score_breakdown={
            "condition": CONDITION_FACTOR.get(grade, 0.75),
            "spec": round(spec_factor, 3),
            "materialValue": mat["value"],
            "similarPriceCount": len(prices),
        },
        analysis_mode=mode,
        loss_mixed_waste=mixed_waste,
        scrap_value=scrap,
        direct_sale_price=direct,
        net_benefit=direct + abs(mixed_waste),
        price_basis=price_basis,
        share_token=secrets.token_urlsafe(16),
    )
    _apply_score(diag, evidence, update_path=True)
    diag.initial_score = diag.liquidity_score
    db.add(diag)
    db.commit()
    db.refresh(diag)
    return diag


def can_watch_demand(diag: AiTriageDiagnosis) -> bool:
    """검색어와 맞춰 볼 품목 용어가 있는지. 없으면 "수요 생기면 알림"을 약속할 수 없다."""
    return bool(_demand_terms(diag.material_key, diag.title, diag.spec_text))


def rescore(db: Session, diag: AiTriageDiagnosis) -> AiTriageDiagnosis:
    """저장된 인자로 수요만 다시 계산 (커밋은 호출자). 이미 매물이 된 진단의 경로는 바꾸지 않는다."""
    evidence = _demand_evidence(
        db, material_key=diag.material_key, title=diag.title, spec_text=diag.spec_text,
        lat=diag.location_lat, lng=diag.location_lng, exclude_material_id=diag.material_id,
        exclude_user_id=diag.user_id,
    )
    _apply_score(diag, evidence, update_path=diag.status != STATUS_LISTED)
    return diag


# ---------------------------------------------------------------------------
# 보관함 수요 상승 알림
# ---------------------------------------------------------------------------
def _should_notify(diag: AiTriageDiagnosis, now: datetime) -> bool:
    base = diag.last_notified_score if diag.last_notified_score is not None else diag.initial_score
    notified_at = _aware(diag.notified_at)
    # 10점 이상 올랐거나, 직거래 유력(A) 문턱을 새로 넘었을 때. 이미 85점인 품목은 최대 +9점이라
    # 상승폭만 보면 영영 알림이 없지만, 그 품목은 처음부터 A였으니 알릴 새 소식이 없는 게 맞다.
    rose = diag.liquidity_score - base >= NOTIFY_DELTA
    crossed = base < PATH_A_MIN <= diag.liquidity_score
    return (rose or crossed) and (notified_at is None or now - notified_at >= NOTIFY_INTERVAL)


def rescore_vault_for_search(db: Session, query: str, lat: Optional[float] = None, lng: Optional[float] = None) -> int:
    """검색어와 품목 용어가 맞는 보관함 진단을 재산정하고, 10점 이상 오르면 알린다. 알림 건수 반환."""
    q = " ".join((query or "").split()).lower()
    if not q:
        return 0
    now = _now()
    rows = (
        db.query(AiTriageDiagnosis)
        .filter(AiTriageDiagnosis.status == STATUS_VAULT)
        .order_by(AiTriageDiagnosis.id.desc())
        .limit(CANDIDATE_LIMIT)
        .all()
    )
    sent = 0
    for diag in rows:
        if not _matches(_demand_terms(diag.material_key, diag.title, diag.spec_text), q):
            continue
        if None not in (lat, lng, diag.location_lat, diag.location_lng) and not _within(
            lat, lng, diag.location_lat, diag.location_lng
        ):
            continue
        rescore(db, diag)
        if not _should_notify(diag, now):
            continue
        # 동시 검색 두 건이 같은 진단을 함께 알리지 않게, 잠근 뒤 최신 행으로 다시 판단한다
        # (Postgres는 먼저 잡은 쪽이 커밋할 때까지 대기. 잠금 재조회가 메모리 값을 덮으므로 재산정을 다시 한다)
        db.flush()
        diag = (
            db.query(AiTriageDiagnosis).filter(AiTriageDiagnosis.id == diag.id)
            .populate_existing().with_for_update().one()
        )
        rescore(db, diag)
        if diag.status != STATUS_VAULT or not _should_notify(diag, now):
            continue
        old = diag.last_notified_score if diag.last_notified_score is not None else diag.initial_score
        new = diag.liquidity_score
        diag.last_notified_score = new
        diag.notified_at = now
        diag.reopened_at = None
        # notify가 커밋한다(잠금 해제). 실패하면 롤백되어 위 알림 표시도 함께 취소된다.
        if notify(
            db,
            user_id=diag.user_id,
            type="TRIAGE_DEMAND",
            title="보관 자재 수요 급증",
            body=(
                f"보관해 둔 {diag.title}의 주변 수요가 늘어 유동성 점수가 {old}점 → {new}점으로 올랐습니다. "
                "지금 원클릭 출품해 보세요."
            ),
            reference_type="triage",
            reference_id=diag.id,
        ) is not None:
            sent += 1
    db.commit()
    return sent


def rescore_vault_for_search_background(
    bind, query: str, lat: Optional[float] = None, lng: Optional[float] = None
) -> int:
    """검색 응답 뒤에 자체 세션으로 실행. 실패는 조용히 무시.

    bind는 요청 세션의 엔진이다. SessionLocal을 직접 쓰면 테스트에서 닿지 않는 DB 호스트로
    접속을 시도해 검색 요청이 DNS 타임아웃만큼 멈춘다.
    """
    db = Session(bind=bind)
    try:
        return rescore_vault_for_search(db, query, lat, lng)
    except Exception:
        db.rollback()
        logger.debug("triage 보관함 재산정 실패", exc_info=True)
        return 0
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 급구 전광판 / 퍼널
# ---------------------------------------------------------------------------
def hot_demands(
    db: Session, lat: Optional[float], lng: Optional[float], radius_km: float = RADIUS_KM,
    min_score: int = 0, limit: int = 5,
) -> dict:
    now = _now()
    groups: dict[str, dict] = {}
    for row in _fetch_logs(db, now - timedelta(days=HOT_WINDOW_DAYS), limit=HOT_CANDIDATE_LIMIT):
        w = _log_weight(row, lat, lng, radius_km)
        text = " ".join((row.query or "").split())
        if w <= 0 or not text:
            continue
        key = detect_material(text) or text.lower()
        g = groups.setdefault(key, {"weight": 0.0, "count": 0, "wanted": 0, "sample": text})  # 최신순이라 첫 값이 최근 검색어
        g["weight"] += w
        g["count"] += 1
    # 열린 구매 요청 = 명시적 수요. 같은 소재(또는 같은 문구) 그룹에 검색 WANTED_WEIGHT건 무게로 더한다
    # 요청자당 그룹 1건 — 한 사람이 같은 문구를 3건 올려 자유 문구 노출 문턱(3)을 넘지 못하게
    seen: set[tuple[str, int]] = set()
    for row in _open_wanted(db, now, limit=HOT_CANDIDATE_LIMIT):
        w = WANTED_WEIGHT * _log_weight(row, lat, lng, radius_km)
        title = " ".join((row.title or "").split())
        if w <= 0 or not _wanted_terms(title, row.description):
            continue
        key = _wanted_material(title, row.description) or title.lower()
        if (key, row.user_id) in seen:
            continue
        seen.add((key, row.user_id))
        g = groups.setdefault(key, {"weight": 0.0, "count": 0, "wanted": 0, "sample": title})
        g["weight"] += w
        g["wanted"] += 1

    items = []
    for key, g in groups.items():
        mat = MATERIALS.get(key)
        # 소재 사전에 없는 그룹은 남이 입력한 검색어가 그대로 홈에 뜬다 — 1~2회짜리 문구는 올리지 않는다
        if mat is None and g["count"] + g["wanted"] < HOT_FREE_TEXT_MIN_COUNT:
            continue
        d, _ = _demand_density(_prior(infer_category(g["sample"])), g["weight"], 0, 0)
        score = _score(1.0, 1.0, (mat or UNKNOWN)["value"], d)["score"]
        if score < min_score:
            continue
        items.append({
            "key": key,
            "label": mat["label"] if mat else g["sample"],
            "searchCount": g["count"],
            "wantedCount": g["wanted"],
            "liquidityScore": score,
            "_weight": g["weight"],
        })
    # "급구" = 검색·요청 수요(가중 건수) 우선. 점수는 소재 가치가 섞여 있어 동률 정렬에만 쓴다
    items.sort(key=lambda i: (i["_weight"], i["liquidityScore"]), reverse=True)
    for i in items:
        del i["_weight"]

    listed = (
        db.query(AiTriageDiagnosis.loss_mixed_waste, AiTriageDiagnosis.location_lat, AiTriageDiagnosis.location_lng)
        .filter(AiTriageDiagnosis.listed_at >= now - timedelta(days=7))
        .all()
    )
    if lat is not None and lng is not None:
        listed = [
            r for r in listed
            if r.location_lat is not None and r.location_lng is not None
            and _within(lat, lng, r.location_lat, r.location_lng, radius_km)
        ]
    return {
        "scope": "nearby" if lat is not None and lng is not None else "all",
        "radiusKm": radius_km,
        "items": items[:limit],
        "weeklyDisposalSaved": sum(abs(r.loss_mixed_waste or 0) for r in listed),
        "weeklyListedCount": len(listed),
    }


def funnel(db: Session, days: int = 30) -> dict:
    # ponytail: 기간 내 행을 파이썬으로 센다. 진단이 수십만 건이 되면 SQL 집계로 교체
    rows = (
        db.query(
            AiTriageDiagnosis.disposition_path, AiTriageDiagnosis.vault_saved_at, AiTriageDiagnosis.listed_at,
            AiTriageDiagnosis.notified_at, AiTriageDiagnosis.reopened_at,
        )
        .filter(AiTriageDiagnosis.created_at >= _now() - timedelta(days=days))
        .all()
    )
    diagnosed = len(rows)
    vault_saved = sum(1 for r in rows if r.vault_saved_at)
    listed = sum(1 for r in rows if r.listed_at)
    push_sent = sum(1 for r in rows if r.notified_at)
    reopened = sum(1 for r in rows if r.notified_at and r.reopened_at)
    rate = lambda a, b: round(a / b, 4) if b else 0.0  # noqa: E731
    return {
        "days": days,
        "diagnosed": diagnosed,
        "vaultSaved": vault_saved,
        "listed": listed,
        "byPath": {p: sum(1 for r in rows if r.disposition_path == p) for p in "ABC"},
        "listedByPath": {p: sum(1 for r in rows if r.listed_at and r.disposition_path == p) for p in "ABC"},
        "pushSent": push_sent,
        "reopenedAfterPush": reopened,
        "vaultSaveRate": rate(vault_saved, diagnosed),
        "listingRate": rate(listed, diagnosed),
        "pushReopenRate": rate(reopened, push_sent),
    }


# ---------------------------------------------------------------------------
# 응답 직렬화 (계약 3.2)
# ---------------------------------------------------------------------------
def _path_reason(path: Optional[str], bd: dict) -> str:
    if path == "A":
        if bd.get("condition", 0) >= 0.85 and bd.get("spec", 0) >= 0.85:
            return "상태와 규격이 명확하고 재사용 수요가 예상됩니다."
        return "주변 재사용 수요가 충분해 직거래 체결이 예상됩니다."
    if path == "B":
        if bd.get("materialValue", 0) >= 0.5:
            return "원형 재사용은 어렵지만 소재 가치가 높아 매입 호가를 받는 편이 유리합니다."
        return "재사용 수요가 제한적이라 소재 매입 호가 비딩을 권합니다."
    return "재사용 수요와 소재 가치가 모두 낮아 중량 기준 일괄 처분이 손실을 줄입니다."


def _iso(dt: Optional[datetime]) -> Optional[str]:
    dt = _aware(dt)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if dt else None


def serialize_diagnosis(diag: AiTriageDiagnosis, *, public: bool = False) -> dict:
    """진단 응답 JSON. public=True(공유 리포트)는 id·주소·좌표를 뺀다."""
    bd = diag.score_breakdown or {}
    data = {
        "id": diag.id,
        "status": diag.status,
        "title": diag.title,
        "category": diag.category,
        "materialKey": diag.material_key,
        "materialLabel": _material(diag.material_key)["label"],
        "conditionGrade": diag.condition_grade,
        "specText": diag.spec_text,
        "imageUrls": diag.image_urls or [],
        "quantity": diag.quantity,
        "quantityUnit": diag.quantity_unit,
        "weightKg": diag.weight_kg,
        "weightEstimated": bool(diag.weight_estimated),
        "location": {"address": diag.location_address, "lat": diag.location_lat, "lng": diag.location_lng},
        "liquidityScore": diag.liquidity_score,
        "initialScore": diag.initial_score,
        "scoreDelta": diag.liquidity_score - diag.initial_score,
        "matchProbability7d": diag.match_probability,
        "expectedDays": diag.expected_days,
        "breakdown": {
            k: bd.get(k, 0) for k in (
                "condition", "spec", "demand", "materialValue", "reuseScore", "materialBonus",
                "searchCount", "wantedCount", "similarActiveCount", "similarSoldCount",
            )
        },
        "coldStart": bool(diag.cold_start),
        "analysisMode": diag.analysis_mode,
        "dispositionPath": diag.disposition_path,
        "pathLabel": PATH_LABELS.get(diag.disposition_path),
        "pathReason": _path_reason(diag.disposition_path, bd),
        "comparison": {
            "mixedWaste": diag.loss_mixed_waste,
            "scrap": diag.scrap_value,
            "directSale": diag.direct_sale_price,
            "netBenefit": diag.net_benefit,
            "priceBasis": diag.price_basis,
            "similarPriceCount": bd.get("similarPriceCount", 0),
        },
        "shareToken": diag.share_token,
        "shareUrl": f"{settings.FRONTEND_URL.rstrip('/')}/triage/report/{diag.share_token}",
        "materialId": diag.material_id,
        "createdAt": _iso(diag.created_at),
    }
    if public:
        del data["id"]
        data["location"] = {"address": None}
    return data
