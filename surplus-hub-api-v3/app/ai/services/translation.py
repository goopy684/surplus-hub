"""Translation service with Redis caching."""

import hashlib
import json
import logging
import threading
from typing import Optional

from app.ai.clients.openai_client import generate_text, DEFAULT_MODEL, _map_model
from app.ai.prompts.translation import TRANSLATION_PROMPT
from app.core.config import settings
from app.schemas.ai_schemas import TranslateResponse

logger = logging.getLogger(__name__)

_sync_redis = None
_redis_lock = threading.Lock()

CACHE_TTL = 3600  # 1 hour


def _get_sync_redis():
    """Thread-safe singleton for synchronous Redis client."""
    global _sync_redis
    if settings.REDIS_URL is None:
        return None
    if _sync_redis is None:
        with _redis_lock:
            if _sync_redis is None:
                import redis
                _sync_redis = redis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_timeout=2,
                )
                logger.info("Sync Redis client initialized for translation cache")
    return _sync_redis


def _cache_key(text: str, source: str, target: str) -> str:
    """Generate cache key from text hash + language pair."""
    text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]
    return f"translate:{text_hash}:{source}:{target}"


def _get_cached(key: str) -> Optional[dict]:
    """Try to get cached translation result."""
    client = _get_sync_redis()
    if client is None:
        return None
    try:
        raw = client.get(key)
        if raw:
            return json.loads(raw)
    except Exception:
        logger.warning("Redis cache read failed for key %s", key, exc_info=True)
    return None


def _set_cached(key: str, data: dict) -> None:
    """Store translation result in cache."""
    client = _get_sync_redis()
    if client is None:
        return
    try:
        client.setex(key, CACHE_TTL, json.dumps(data, ensure_ascii=False))
    except Exception:
        logger.warning("Redis cache write failed for key %s", key, exc_info=True)


def translate_text(
    text: str,
    source_language: str,
    target_language: str,
) -> TranslateResponse:
    """Translate text using OpenAI with Redis caching."""
    # JSON 구조체 번역 방지 (LOCATION 메시지 등 손상 방지)
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            json.loads(stripped)
            raise ValueError(
                "Structured JSON data cannot be translated. "
                "Extract text fields before calling this API."
            )
        except json.JSONDecodeError:
            pass  # JSON 아님 — 일반 텍스트로 진행

    cache_key = _cache_key(text, source_language, target_language)

    # Check cache
    cached = _get_cached(cache_key)
    if cached:
        return TranslateResponse(
            translatedText=cached["translated_text"],
            sourceLanguage=cached.get("detected_language", source_language),
            targetLanguage=target_language,
            modelUsed=_map_model(DEFAULT_MODEL),
        )

    # Build user prompt
    if source_language == "auto":
        user_prompt = f"다음 텍스트를 {target_language}로 번역하세요:\n\n{text}"
    else:
        user_prompt = (
            f"다음 {source_language} 텍스트를 {target_language}로 번역하세요:\n\n{text}"
        )

    raw = generate_text(
        system_prompt=TRANSLATION_PROMPT,
        user_prompt=user_prompt,
        max_tokens=2048,
        temperature=0.3,
    )

    # Parse JSON response
    result_text = raw.strip()
    if result_text.startswith("```"):
        result_text = result_text.split("\n", 1)[1]
        if result_text.endswith("```"):
            result_text = result_text[:-3].strip()

    try:
        data = json.loads(result_text)
    except json.JSONDecodeError:
        logger.warning("Translation LLM returned non-JSON: %s", result_text[:200])
        data = {"translated_text": result_text, "detected_language": source_language}

    # Cache result
    _set_cached(cache_key, data)

    detected = data.get("detected_language", source_language)

    return TranslateResponse(
        translatedText=data.get("translated_text", result_text),
        sourceLanguage=detected if detected != "auto" else source_language,
        targetLanguage=target_language,
        modelUsed=_map_model(DEFAULT_MODEL),
    )
