"""Hybrid response cache: in-memory TTL fallback, Redis path, and endpoint invalidation."""

import uuid
from unittest.mock import MagicMock, patch

from app.core import cache
from app.core.config import settings

API = settings.API_V1_STR


# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------
def test_ttl_expiry():
    store = cache._InMemoryTTLCache()
    with patch.object(cache.time, "monotonic", return_value=100.0):
        store.set("k", "v", ttl_seconds=10)
        assert store.get("k") == "v"
    with patch.object(cache.time, "monotonic", return_value=110.0):
        assert store.get("k") is None


def test_lru_eviction():
    store = cache._InMemoryTTLCache(max_entries=2)
    store.set("a", "1", 60)
    store.set("b", "2", 60)
    store.get("a")  # a is now most recent
    store.set("c", "3", 60)
    assert store.get("b") is None
    assert store.get("a") == "1" and store.get("c") == "3"


def test_prefix_invalidation_without_redis():
    with patch.object(settings, "REDIS_URL", None):
        cache.cache_set_json("materials:list:abc", {"x": 1})
        cache.cache_set_json("materials:listing", {"x": 2})
        cache.cache_set_json("events:list", {"x": 3})
        assert cache.cache_invalidate_prefix("materials:list") == 2
        assert cache.cache_get_json("materials:list:abc") is None
        assert cache.cache_get_json("events:list") == {"x": 3}


def test_make_cache_key_is_order_independent():
    assert cache.make_cache_key("p") == "p"
    a = cache.make_cache_key("p", page=1, q="x")
    assert a == cache.make_cache_key("p", q="x", page=1)
    assert a != cache.make_cache_key("p", page=2, q="x")
    assert a.startswith("p:") and len(a) == len("p:") + 16


# ---------------------------------------------------------------------------
# Redis path (mocked client)
# ---------------------------------------------------------------------------
def test_redis_get_set_and_scan_invalidate():
    client = MagicMock()
    client.get.return_value = '{"hit": true}'
    client.scan_iter.return_value = iter(["materials:list:1", "materials:list:2"])
    client.delete.return_value = 2
    with patch.object(cache, "_get_redis_client", return_value=client):
        cache.cache_set_json("k", {"a": 1}, ttl_seconds=30)
        client.setex.assert_called_once_with("k", 30, '{"a": 1}')
        assert cache.cache_get_json("k") == {"hit": True}
        assert cache.cache_invalidate_prefix("materials:list") == 2
        client.scan_iter.assert_called_once_with(match="materials:list*")
        client.delete.assert_called_once_with("materials:list:1", "materials:list:2")


def test_redis_miss_does_not_serve_stale_local_copy():
    """Another worker invalidated Redis; this worker's memory copy must not be served."""
    client = MagicMock()
    client.get.return_value = None
    with patch.object(cache, "_get_redis_client", return_value=client):
        cache.cache_set_json("k", {"stale": True})
        assert cache.cache_get_json("k") is None


def test_redis_errors_fall_back_to_memory():
    client = MagicMock()
    client.get.side_effect = ConnectionError("down")
    client.setex.side_effect = ConnectionError("down")
    client.scan_iter.side_effect = ConnectionError("down")
    with patch.object(cache, "_get_redis_client", return_value=client), \
         patch.object(cache, "_redis_client", None), patch.object(cache, "_redis_failed_at", 0.0):
        cache.cache_set_json("k", {"a": 1})
        assert cache.cache_get_json("k") == {"a": 1}
        assert cache.cache_invalidate_prefix("k") == 1


def test_unreachable_redis_returns_none_and_backs_off():
    with patch.object(settings, "REDIS_URL", "redis://127.0.0.1:1/0"), \
         patch.object(cache, "_redis_client", None), \
         patch.object(cache, "_redis_failed_at", 0.0), \
         patch("redis.Redis.from_url") as from_url:
        from_url.return_value.ping.side_effect = ConnectionError("refused")
        assert cache._get_redis_client() is None
        assert cache._get_redis_client() is None  # within cooldown: no reconnect
        assert from_url.call_count == 1
        cache.cache_set_json("k", [1])
        assert cache.cache_get_json("k") == [1]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
def test_categories_cache_hit_keeps_camelcase(client):
    first = client.get(f"{API}/categories/").json()
    with patch("app.api.endpoints.categories.crud_category.get_active") as get_active:
        second = client.get(f"{API}/categories/").json()
    get_active.assert_not_called()
    assert first == second
    assert "displayOrder" in second["data"][0] and "display_order" not in second["data"][0]


def _create(client, headers, keyword):
    resp = client.post(f"{API}/materials/", headers=headers, json={
        "title": f"{keyword} beam", "description": "cache test", "price": 1000,
        "location": {"address": "Seoul"}, "quantity": 1, "quantityUnit": "EA", "tradeMethod": "DIRECT",
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["id"]


def _list_ids(client, keyword):
    body = client.get(f"{API}/materials/", params={"keyword": keyword}).json()
    return body, [m["id"] for m in body["data"]]


def test_materials_list_cache_hit_keeps_camelcase(client, auth_headers):
    kw = uuid.uuid4().hex[:10]
    _create(client, auth_headers, kw)
    first, _ = _list_ids(client, kw)
    with patch("app.api.endpoints.materials.crud_material.get_multi_with_filters") as query:
        second, _ = _list_ids(client, kw)
    query.assert_not_called()
    assert first == second
    item = second["data"][0]
    assert {"quantityUnit", "tradeMethod", "thumbnailUrl"} <= item.keys()
    assert "quantity_unit" not in item


def test_material_create_and_status_change_invalidate_list(client, auth_headers):
    kw = uuid.uuid4().hex[:10]
    first = _create(client, auth_headers, kw)
    assert _list_ids(client, kw)[1] == [first]

    second = _create(client, auth_headers, kw)
    assert set(_list_ids(client, kw)[1]) == {first, second}

    resp = client.patch(f"{API}/materials/{second}/status", headers=auth_headers, json={"status": "HIDDEN"})
    assert resp.status_code == 200, resp.text
    assert _list_ids(client, kw)[1] == [first]


def test_admin_review_invalidates_list(client, auth_headers, superuser_headers):
    kw = uuid.uuid4().hex[:10]
    mid = _create(client, auth_headers, kw)
    assert _list_ids(client, kw)[1] == [mid]
    resp = client.patch(
        f"{API}/admin/materials/{mid}/review", headers=superuser_headers, json={"action": "reject", "note": "x"},
    )
    assert resp.status_code == 200, resp.text
    assert _list_ids(client, kw)[1] == []


# ---------------------------------------------------------------------------
# Boundary conditions
# ---------------------------------------------------------------------------
def test_corrupt_json_is_a_miss():
    with patch.object(settings, "REDIS_URL", None):
        cache._memory.set("k", "{not json", 60)
        assert cache.cache_get_json("k") is None
    client = MagicMock()
    client.get.return_value = "{not json"
    with patch.object(cache, "_get_redis_client", return_value=client):
        assert cache.cache_get_json("k") is None


def test_runtime_redis_error_enters_cooldown():
    client = MagicMock()
    client.get.side_effect = ConnectionError("timeout")
    with patch.object(settings, "REDIS_URL", "redis://127.0.0.1:1/0"), \
         patch.object(cache, "_redis_client", client), \
         patch.object(cache, "_redis_failed_at", 0.0), \
         patch("redis.Redis.from_url") as from_url:
        assert cache.cache_get_json("k") is None
        assert cache._redis_client is None and cache._redis_failed_at > 0
        cache.cache_set_json("k", {"a": 1})
        assert cache.cache_get_json("k") == {"a": 1}  # served from memory, no Redis wait
        assert client.get.call_count == 1
        from_url.assert_not_called()


def test_clear_all_also_clears_redis_prefixes():
    client = MagicMock()
    client.scan_iter.return_value = iter([])
    with patch.object(cache, "_redis_client", client), \
         patch.object(cache, "_get_redis_client", return_value=client):
        cache.cache_clear_all()
    matched = {c.kwargs["match"] for c in client.scan_iter.call_args_list}
    assert matched == {f"{p}*" for p in cache._CACHE_PREFIXES}


def test_rate_limiter_falls_back_when_redis_down():
    from app.core import rate_limit

    with patch.object(settings, "REDIS_URL", "redis://127.0.0.1:1/0"):
        limiter = rate_limit._get_limiter()
    assert limiter._in_memory_fallback_enabled and limiter._swallow_errors


def test_suggestions_query_is_stripped_like_cache_key(client):
    with patch("app.api.endpoints.ai_assist.search_service.get_search_suggestions", return_value=[]) as svc:
        assert client.get(f"{API}/ai/search/suggestions", params={"q": "  steel  "}).status_code == 200
        assert client.get(f"{API}/ai/search/suggestions", params={"q": "steel"}).status_code == 200
    svc.assert_called_once()
    assert svc.call_args.kwargs["query"] == "steel"


def test_hidden_material_drops_from_suggestions(client, auth_headers):
    kw = uuid.uuid4().hex[:10]
    mid = _create(client, auth_headers, kw)

    def titles():
        body = client.get(f"{API}/ai/search/suggestions", params={"q": kw}).json()
        return [s["text"] for s in body["data"]["suggestions"]]

    assert f"{kw} beam" in titles()
    resp = client.patch(f"{API}/materials/{mid}/status", headers=auth_headers, json={"status": "HIDDEN"})
    assert resp.status_code == 200, resp.text
    assert f"{kw} beam" not in titles()
