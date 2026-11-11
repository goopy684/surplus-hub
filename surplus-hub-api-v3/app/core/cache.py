"""Response cache: Redis when REDIS_URL is set and reachable, otherwise an in-process TTL LRU.

Cache failures never surface to callers — every Redis call falls back to the in-memory store.
Values are stored as JSON (by_alias=True) so a cache hit returns the same keys as a miss.
"""

import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from typing import Any, Optional

from fastapi.encoders import jsonable_encoder

from app.core.config import settings

logger = logging.getLogger(__name__)

_RETRY_AFTER = 60.0  # seconds before retrying a failed Redis connection


class _InMemoryTTLCache:
    def __init__(self, max_entries: int = 2048):
        self._data: "OrderedDict[str, tuple[float, str]]" = OrderedDict()
        self._lock = threading.RLock()
        self._max = max_entries

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= time.monotonic():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: str, value: str, ttl_seconds: int) -> None:
        with self._lock:
            self._data[key] = (time.monotonic() + ttl_seconds, value)
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)

    def delete_prefix(self, prefix: str) -> int:
        with self._lock:
            keys = [k for k in self._data if k.startswith(prefix)]
            for k in keys:
                del self._data[k]
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


_memory = _InMemoryTTLCache()
_redis_client = None
_redis_failed_at = 0.0
_redis_lock = threading.Lock()


def _get_redis_client():
    global _redis_client, _redis_failed_at
    url = (settings.REDIS_URL or "").strip()
    if not url:
        return None
    if _redis_client is not None:
        return _redis_client
    if time.monotonic() - _redis_failed_at < _RETRY_AFTER:
        return None
    with _redis_lock:
        if _redis_client is not None:
            return _redis_client
        try:
            import redis

            client = redis.Redis.from_url(
                url, decode_responses=True, socket_connect_timeout=1.0, socket_timeout=1.0
            )
            client.ping()
            _redis_client = client
        except Exception as exc:  # ImportError included
            _redis_failed_at = time.monotonic()
            logger.warning("Redis cache unavailable, using in-memory cache: %s", exc)
    return _redis_client


def _mark_redis_failed(op: str, key: str, exc: Exception) -> None:
    # Drop the client so the next RETRY_AFTER seconds skip Redis instead of
    # paying the socket timeout on every request.
    global _redis_client, _redis_failed_at
    _redis_client = None
    _redis_failed_at = time.monotonic()
    logger.warning("Redis %s failed for %s, using in-memory cache: %s", op, key, exc)


def make_cache_key(prefix: str, **params: Any) -> str:
    if not params:
        return prefix
    raw = json.dumps(params, sort_keys=True, default=str)
    return f"{prefix}:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"


def cache_get_json(key: str) -> Optional[Any]:
    # A Redis miss is authoritative: another worker may have invalidated the key,
    # so this process's in-memory copy is only consulted when Redis is down.
    client = _get_redis_client()
    raw = None
    if client is not None:
        try:
            raw = client.get(key)
        except Exception as exc:
            _mark_redis_failed("get", key, exc)
            raw = _memory.get(key)
    else:
        raw = _memory.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        logger.warning("Corrupt cache entry for %s, treating as miss", key)
        return None


def cache_set_json(key: str, value: Any, ttl_seconds: int = 60) -> None:
    serialized = json.dumps(jsonable_encoder(value, by_alias=True), ensure_ascii=False, default=str)
    _memory.set(key, serialized, ttl_seconds)
    client = _get_redis_client()
    if client is not None:
        try:
            client.setex(key, ttl_seconds, serialized)
        except Exception as exc:
            _mark_redis_failed("set", key, exc)


def cache_invalidate_prefix(prefix: str) -> int:
    removed = _memory.delete_prefix(prefix)
    client = _get_redis_client()
    if client is not None:
        try:
            keys = list(client.scan_iter(match=f"{prefix}*"))
            if keys:
                removed += client.delete(*keys)
        except Exception as exc:
            _mark_redis_failed("invalidate", prefix, exc)
    return removed


_CACHE_PREFIXES = ("categories:", "events:", "materials:", "admin:dashboard", "ai:")


def cache_clear_all() -> None:
    _memory.clear()
    if _redis_client is not None:
        for prefix in _CACHE_PREFIXES:
            cache_invalidate_prefix(prefix)


def invalidate_material_caches() -> None:
    """Material visibility changed: drop lists, dashboard stats and title autocomplete."""
    for prefix in ("materials:list", "admin:dashboard", "ai:suggestions"):
        cache_invalidate_prefix(prefix)
