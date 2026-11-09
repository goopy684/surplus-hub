"""Gemini 2.5 Flash-Lite vision client (singleton)."""

import base64
import json
import logging
import mimetypes
import threading
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None
_lock = threading.Lock()

MODEL_NAME = "gemini-2.5-flash-lite"


def _is_retryable_error(exc: BaseException) -> bool:
    """Check if the exception is a retryable Gemini API error."""
    exc_str = str(exc)
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status_code in (429, 500, 503):
        return True
    for keyword in ("429", "500", "503", "rate limit", "overloaded", "unavailable"):
        if keyword.lower() in exc_str.lower():
            return True
    return False


def _get_client():
    """Thread-safe singleton for google.genai.Client."""
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                from google import genai
                if settings.use_vertex:
                    _client = genai.Client(
                        vertexai=True,
                        project=settings.GOOGLE_CLOUD_PROJECT,
                        location=settings.GOOGLE_CLOUD_LOCATION,
                    )
                    logger.info("Gemini vision client initialized (Vertex AI, project=%s)", settings.GOOGLE_CLOUD_PROJECT)
                else:
                    _client = genai.Client(
                        api_key=settings.GOOGLE_AI_API_KEY,
                        http_options={"timeout": 30_000},
                    )
                    logger.info("Gemini vision client initialized (API key)")
    return _client


def _parse_data_uri(data_uri: str) -> tuple[bytes, str]:
    """Parse a data URI and return (raw_bytes, mime_type)."""
    # data:[<mediatype>][;base64],<data>
    header, _, data = data_uri.partition(",")
    mime_type = "image/jpeg"
    if header.startswith("data:"):
        mime_part = header[5:]  # strip "data:"
        mime_type = mime_part.split(";")[0] or "image/jpeg"
    return base64.b64decode(data), mime_type


def _download_image(url: str) -> tuple[bytes, str]:
    """Download image from URL and return (raw_bytes, mime_type)."""
    with httpx.Client(timeout=15.0, follow_redirects=True) as http:
        resp = http.get(url)
        resp.raise_for_status()
    content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    if content_type == "application/octet-stream":
        guessed = mimetypes.guess_type(url)[0]
        content_type = guessed or "image/jpeg"
    return resp.content, content_type


def _before_retry(retry_state):
    logger.warning(
        "Retrying Gemini API call (attempt %d/%d): %s",
        retry_state.attempt_number,
        3,
        retry_state.outcome.exception() if retry_state.outcome else "unknown",
    )


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception(_is_retryable_error),
    before_sleep=_before_retry,
    reraise=True,
)
def analyze_image(
    image_url: str, categories: Optional[list] = None, keyword: Optional[str] = None
) -> dict:
    """Analyze a material image and return structured metadata.

    Returns dict with keys:
        category, tags, title_suggestion, condition, material_type, confidence
    """
    from app.ai.prompts.material import IMAGE_ANALYSIS_PROMPT

    category_hint = ""
    if categories:
        category_hint = f"\n사용 가능한 카테고리: {', '.join(categories)}"

    prompt = IMAGE_ANALYSIS_PROMPT + category_hint
    if keyword:
        prompt += (
            f"\n\n판매자가 입력한 키워드: {keyword}\n"
            "- title_suggestion과 material_type은 이 키워드의 자재명·규격을 그대로 우선 사용한다 "
            "(이미지 추정과 다르면 키워드를 따른다)."
        )

    client = _get_client()

    # Resolve image bytes + mime type from various sources
    if image_url.startswith("data:"):
        image_bytes, mime_type = _parse_data_uri(image_url)
    elif image_url.startswith("gs://"):
        image_bytes, mime_type = None, "image/jpeg"  # pass as URI
    else:
        image_bytes, mime_type = _download_image(image_url)

    if settings.use_vertex:
        from google.genai import types

        parts = [types.Part.from_text(text=prompt)]
        if image_bytes is None:
            parts.append(types.Part.from_uri(file_uri=image_url, mime_type=mime_type))
        else:
            parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[types.Content(role="user", parts=parts)],
        )
    else:
        if image_bytes is not None:
            b64 = base64.b64encode(image_bytes).decode("ascii")
            image_part = {"inline_data": {"data": b64, "mime_type": mime_type}}
        else:
            image_part = {"file_data": {"file_uri": image_url, "mime_type": mime_type}}

        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[{"parts": [{"text": prompt}, image_part]}],
        )

    # Parse JSON from response
    text = response.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Gemini returned non-JSON response: %s", text[:200])
        result = {
            "category": None,
            "tags": [],
            "title_suggestion": None,
            "condition": None,
            "material_type": None,
            "confidence": 0.0,
        }

    return result
