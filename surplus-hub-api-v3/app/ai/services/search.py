"""Hybrid semantic search service (keyword + vector)."""

import hashlib
import logging
import threading
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy import case, func, or_, text
from sqlalchemy.orm import Session

from app.ai.clients.embeddings import build_search_text, generate_embedding
from app.models.material import Material

logger = logging.getLogger(__name__)

KEYWORD_WEIGHT = 0.3
VECTOR_WEIGHT = 0.7
MIN_SIMILARITY = 0.3

# ---------------------------------------------------------------------------
# Embedding cache (thread-safe in-memory LRU)
# ---------------------------------------------------------------------------
_embedding_cache: Dict[str, List[float]] = {}
_cache_lock = threading.Lock()
_CACHE_MAX_SIZE = 1000


def get_or_generate_embedding(text_input: str) -> List[float]:
    """Return cached embedding or generate and cache a new one."""
    cache_key = hashlib.md5(text_input.encode()).hexdigest()
    with _cache_lock:
        if cache_key in _embedding_cache:
            return _embedding_cache[cache_key]
    embedding = generate_embedding(text_input)
    with _cache_lock:
        if len(_embedding_cache) >= _CACHE_MAX_SIZE:
            oldest_key = next(iter(_embedding_cache))
            del _embedding_cache[oldest_key]
        _embedding_cache[cache_key] = embedding
    return embedding


# ---------------------------------------------------------------------------
# Haversine distance helper
# ---------------------------------------------------------------------------
def _haversine_distance_expr(lat: float, lng: float):
    """SQLAlchemy expression for haversine distance in km."""
    return (
        6371
        * func.acos(
            func.least(
                1.0,
                func.cos(func.radians(lat))
                * func.cos(func.radians(Material.location_lat))
                * func.cos(func.radians(Material.location_lng) - func.radians(lng))
                + func.sin(func.radians(lat))
                * func.sin(func.radians(Material.location_lat)),
            )
        )
    )


# ---------------------------------------------------------------------------
# 현장 은어 → 표준 자재명 확장
# ---------------------------------------------------------------------------
# 키는 공백 무시 부분일치로 비교한다 (expand_query).
FIELD_SLANG: dict[str, list[str]] = {
    "아시바": ["비계", "강관비계"],
    "분홍색 단열재": ["아이소핑크", "압출법 단열재"],
    "분홍 단열재": ["아이소핑크", "압출법 단열재"],
    "핑크 단열재": ["아이소핑크", "압출법 단열재"],
    "녹 안 스는": ["스테인리스", "SUS"],
    "스뎅": ["스테인리스", "SUS"],
    "스텐": ["스테인리스", "SUS"],
    "공구리": ["콘크리트"],
    "빠루": ["노루발", "배척"],
    "샤시": ["새시", "창호"],
    "샷시": ["새시", "창호"],
    "덴조": ["천장재"],
    "다루끼": ["각재"],
    "오비끼": ["각재"],
    "코팡": ["코팅합판", "거푸집"],
    "코팅 합판": ["코팅합판", "거푸집"],
    "하이바": ["안전모"],
    "와꾸": ["틀", "프레임"],
    "기리": ["드릴 비트"],
    "도끼다시": ["테라조"],
    "메지": ["줄눈", "줄눈재"],
    "뺑끼": ["페인트"],
    "반생": ["결속선"],
    "렌가": ["벽돌"],
    "후앙": ["환풍기"],
}


def expand_query(query: str) -> List[str]:
    """검색어에 포함된 현장 은어를 표준 자재명으로 확장 (중복 제거, 원래 순서 유지).

    공백을 모두 지운 상태로 비교해 "녹안스는"/"녹 안 스는"을 같은 은어로 본다.
    """
    compact = "".join(query.split())
    terms: List[str] = []
    for slang, standard in FIELD_SLANG.items():
        if slang.replace(" ", "") in compact:
            terms.extend(t for t in standard if t not in terms)
    return terms


def _keyword_match(query: str, terms: List[str]):
    """제목/설명이 원래 검색어 또는 확장어 중 하나라도 포함하면 매칭."""
    return or_(
        *(
            col.ilike(f"%{t}%")
            for t in [query, *terms]
            for col in (Material.title, Material.description)
        )
    )


def _base_filter(
    status: str,
    category: Optional[str],
    price_min: Optional[int],
    price_max: Optional[int],
    trade_method: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    location_lat: Optional[float],
    location_lng: Optional[float],
    radius_km: Optional[float],
):
    """두 검색 함수가 공유하는 필터. Returns (base_filter, distance_col or None)."""
    base_filter = Material.status == status
    if category:
        base_filter = base_filter & (Material.category == category)
    if price_min is not None:
        base_filter = base_filter & (Material.price >= price_min)
    if price_max is not None:
        base_filter = base_filter & (Material.price <= price_max)
    if trade_method:
        # 직거래/택배 필터는 둘 다 가능(BOTH)한 매물도 포함한다
        base_filter = base_filter & Material.trade_method.in_([trade_method, "BOTH"])
    if date_from:
        base_filter = base_filter & (Material.created_at >= date_from)
    if date_to:
        base_filter = base_filter & (Material.created_at <= date_to)

    # Distance filter
    distance_col = None
    if location_lat is not None and location_lng is not None:
        distance_col = _haversine_distance_expr(location_lat, location_lng).label(
            "distance_km"
        )
        base_filter = base_filter & (Material.location_lat.isnot(None))
        base_filter = base_filter & (Material.location_lng.isnot(None))
        if radius_km:
            base_filter = base_filter & (
                _haversine_distance_expr(location_lat, location_lng) <= radius_km
            )
    return base_filter, distance_col


# ---------------------------------------------------------------------------
# Keyword-only fallback search
# ---------------------------------------------------------------------------
def keyword_only_search(
    db: Session,
    query: str,
    page: int = 1,
    limit: int = 20,
    category: Optional[str] = None,
    status: str = "ACTIVE",
    price_min: Optional[int] = None,
    price_max: Optional[int] = None,
    location_lat: Optional[float] = None,
    location_lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    trade_method: Optional[str] = None,
    sort_by: str = "relevance",
) -> Tuple[List[dict], int, str]:
    """Keyword-only search fallback when embedding generation fails.

    Returns (results, total_count, search_mode).
    """
    base_filter, distance_col = _base_filter(
        status, category, price_min, price_max, trade_method,
        date_from, date_to, location_lat, location_lng, radius_km,
    )
    keyword_filter = _keyword_match(query, expand_query(query))

    count_q = (
        db.query(func.count(Material.id)).filter(base_filter).filter(keyword_filter)
    )
    total = count_q.scalar() or 0

    # Build query
    query_cols = [Material]
    if distance_col is not None:
        query_cols.append(distance_col)

    q = db.query(*query_cols).filter(base_filter).filter(keyword_filter)

    # Sorting
    if sort_by == "price_asc":
        q = q.order_by(Material.price.asc())
    elif sort_by == "price_desc":
        q = q.order_by(Material.price.desc())
    elif sort_by == "newest":
        q = q.order_by(Material.created_at.desc())
    else:
        q = q.order_by(Material.created_at.desc())

    offset = (page - 1) * limit
    rows = q.offset(offset).limit(limit).all()

    results = []
    for row in rows:
        if distance_col is not None:
            material, dist = row[0], float(row[1])
        else:
            material = row
            dist = None
        results.append(
            {
                "material": material,
                "score": 1.0,
                "vector_similarity": 0.0,
                "keyword_score": 1.0,
                "distance_km": dist,
            }
        )

    return results, total, "keyword_only"


# ---------------------------------------------------------------------------
# Hybrid search (keyword + vector) with dynamic filters
# ---------------------------------------------------------------------------
def hybrid_search(
    db: Session,
    query: str,
    page: int = 1,
    limit: int = 20,
    category: Optional[str] = None,
    status: str = "ACTIVE",
    price_min: Optional[int] = None,
    price_max: Optional[int] = None,
    location_lat: Optional[float] = None,
    location_lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    trade_method: Optional[str] = None,
    sort_by: str = "relevance",
) -> Tuple[List[dict], int, str]:
    """Hybrid search combining keyword matching and vector similarity.

    Returns (results, total_count, search_mode) where each result is a dict with
    'material', 'score', 'vector_similarity', 'keyword_score', and 'distance_km' keys.
    search_mode is 'hybrid' or 'keyword_only'.
    """
    terms = expand_query(query)
    embed_input = f"{query} ({', '.join(terms)})" if terms else query
    try:
        query_embedding = get_or_generate_embedding(embed_input)
    except Exception:
        logger.warning("Embedding generation failed, falling back to keyword search")
        return keyword_only_search(
            db,
            query,
            page=page,
            limit=limit,
            category=category,
            status=status,
            price_min=price_min,
            price_max=price_max,
            location_lat=location_lat,
            location_lng=location_lng,
            radius_km=radius_km,
            date_from=date_from,
            date_to=date_to,
            trade_method=trade_method,
            sort_by=sort_by,
        )

    base_filter, distance_col = _base_filter(
        status, category, price_min, price_max, trade_method,
        date_from, date_to, location_lat, location_lng, radius_km,
    )
    # Only search materials that have embeddings
    base_filter = base_filter & (Material.embedding_vector.isnot(None))

    # Cosine distance via pgvector <=> operator (lower = more similar)
    cosine_distance = Material.embedding_vector.cosine_distance(query_embedding)
    vector_similarity = (1 - cosine_distance).label("vector_similarity")

    # Keyword score: ILIKE match on title/description (은어 확장어 포함)
    keyword_score = case(
        (_keyword_match(query, terms), 1.0),
        else_=0.0,
    ).label("keyword_score")

    # Hybrid score
    hybrid_score = (
        KEYWORD_WEIGHT * keyword_score + VECTOR_WEIGHT * vector_similarity
    ).label("hybrid_score")

    # Count query
    count_q = (
        db.query(func.count(Material.id))
        .filter(base_filter)
        .filter((1 - cosine_distance) >= MIN_SIMILARITY)
    )
    total = count_q.scalar() or 0

    # Main query columns
    query_cols = [Material, hybrid_score, vector_similarity, keyword_score]
    if distance_col is not None:
        query_cols.append(distance_col)

    q = (
        db.query(*query_cols)
        .filter(base_filter)
        .filter((1 - cosine_distance) >= MIN_SIMILARITY)
    )

    # Sorting
    if sort_by == "price_asc":
        q = q.order_by(Material.price.asc())
    elif sort_by == "price_desc":
        q = q.order_by(Material.price.desc())
    elif sort_by == "newest":
        q = q.order_by(Material.created_at.desc())
    elif sort_by == "distance" and distance_col is not None:
        q = q.order_by(distance_col.asc())
    else:
        q = q.order_by(hybrid_score.desc())

    offset = (page - 1) * limit
    rows = q.offset(offset).limit(limit).all()

    results = []
    for row in rows:
        if distance_col is not None:
            material, h_score, v_sim, k_score, dist = (
                row[0],
                float(row[1]),
                float(row[2]),
                float(row[3]),
                float(row[4]),
            )
        else:
            material, h_score, v_sim, k_score = (
                row[0],
                float(row[1]),
                float(row[2]),
                float(row[3]),
            )
            dist = None
        results.append(
            {
                "material": material,
                "score": h_score,
                "vector_similarity": v_sim,
                "keyword_score": k_score,
                "distance_km": dist,
            }
        )

    return results, total, "hybrid"


def vector_search_only(
    db: Session,
    query: str,
    limit: int = 10,
    status: str = "ACTIVE",
) -> List[Tuple[Material, float]]:
    """Pure vector similarity search. Returns (Material, similarity) pairs."""
    try:
        query_embedding = get_or_generate_embedding(query)
    except Exception:
        logger.exception("Failed to generate query embedding")
        return []

    cosine_distance = Material.embedding_vector.cosine_distance(query_embedding)
    similarity = (1 - cosine_distance).label("similarity")

    rows = (
        db.query(Material, similarity)
        .filter(Material.status == status)
        .filter(Material.embedding_vector.isnot(None))
        .filter((1 - cosine_distance) >= MIN_SIMILARITY)
        .order_by(cosine_distance)
        .limit(limit)
        .all()
    )

    return [(row[0], float(row[1])) for row in rows]


def find_similar_materials(
    db: Session,
    material_id: int,
    limit: int = 5,
) -> List[Tuple[Material, float]]:
    """Find materials similar to a given material."""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material or material.embedding_vector is None:
        return []

    cosine_distance = Material.embedding_vector.cosine_distance(
        material.embedding_vector
    )
    similarity = (1 - cosine_distance).label("similarity")

    rows = (
        db.query(Material, similarity)
        .filter(Material.id != material_id)
        .filter(Material.status == "ACTIVE")
        .filter(Material.embedding_vector.isnot(None))
        .filter((1 - cosine_distance) >= MIN_SIMILARITY)
        .order_by(cosine_distance)
        .limit(limit)
        .all()
    )

    return [(row[0], float(row[1])) for row in rows]


# ---------------------------------------------------------------------------
# Search suggestions
# ---------------------------------------------------------------------------
def get_search_suggestions(
    db: Session,
    query: str,
    limit: int = 5,
) -> List[dict]:
    """Return search suggestions based on title prefix, categories, and popular queries."""
    suggestions = []

    if len(query) < 2:
        return suggestions

    # 1. Title prefix matches
    title_matches = (
        db.query(Material.title)
        .filter(Material.status == "ACTIVE")
        .filter(Material.title.ilike(f"%{query}%"))
        .distinct()
        .limit(limit)
        .all()
    )
    for row in title_matches:
        suggestions.append({"text": row[0], "type": "title", "count": None})

    # 2. Category matches
    cat_matches = (
        db.query(Material.category)
        .filter(Material.category.isnot(None))
        .filter(Material.category.ilike(f"%{query}%"))
        .distinct()
        .limit(3)
        .all()
    )
    for row in cat_matches:
        suggestions.append({"text": row[0], "type": "category", "count": None})

    # 3. Popular queries from search_logs
    try:
        from app.models.search_log import SearchLog

        popular = (
            db.query(SearchLog.query, func.count(SearchLog.id).label("cnt"))
            .filter(SearchLog.query.ilike(f"%{query}%"))
            .group_by(SearchLog.query)
            .order_by(func.count(SearchLog.id).desc())
            .limit(3)
            .all()
        )
        for row in popular:
            suggestions.append({"text": row[0], "type": "popular", "count": row[1]})
    except Exception:
        pass

    # Deduplicate by text, keep first occurrence
    seen = set()
    unique = []
    for s in suggestions:
        if s["text"] not in seen:
            seen.add(s["text"])
            unique.append(s)
    return unique[:limit]


def log_search_query(
    db: Session,
    query: str,
    results_count: int,
    user_id: Optional[int] = None,
) -> None:
    """Log a search query for analytics and suggestions."""
    try:
        from app.models.search_log import SearchLog

        log = SearchLog(query=query, user_id=user_id, results_count=results_count)
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
        logger.debug("Failed to log search query", exc_info=True)
