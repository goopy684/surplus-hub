"""Text generation client — OpenAI (default) or Vertex AI Gemini (vertex)."""

import logging
import threading
from typing import List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None
_lock = threading.Lock()

DEFAULT_MODEL = "gpt-5-nano"
REASONING_MODEL = "gpt-5-mini"

_VERTEX_MODEL_MAP = {
    "gpt-5-nano": "gemini-2.5-flash-lite",
    "gpt-5-mini": "gemini-2.5-flash",
}


def _map_model(model: str) -> str:
    """Map OpenAI model name to Gemini equivalent when using Vertex."""
    if settings.use_vertex:
        return _VERTEX_MODEL_MAP.get(model, "gemini-2.5-flash-lite")
    return model


def _ollama_native_chat(messages: List[dict], max_tokens: int, temperature: float) -> str:
    """Generate via Ollama's NATIVE /api/chat with thinking disabled.

    The OpenAI-compatible /v1 path cannot turn off "thinking" for reasoning
    models (e.g. gemma4), which makes them very slow and low-quality. The native
    endpoint can, via think:false. See dev/research/local-llm-setup-guide.md (#1).
    """
    import httpx

    base = settings.LOCAL_LLM_BASE_URL.rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3].rstrip("/")
    payload = {
        "model": settings.LOCAL_LLM_MODEL,
        "stream": False,
        "think": settings.LOCAL_LLM_THINK,
        "messages": messages,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    with httpx.Client(timeout=settings.LOCAL_LLM_TIMEOUT) as client:
        resp = client.post(f"{base}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "") or ""


def _get_client():
    """Thread-safe singleton — returns OpenAI client or google.genai Client."""
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                if settings.use_vertex:
                    from google import genai
                    _client = genai.Client(
                        vertexai=True,
                        project=settings.GOOGLE_CLOUD_PROJECT,
                        location=settings.GOOGLE_CLOUD_LOCATION,
                    )
                    logger.info("Vertex AI text client initialized (project=%s)", settings.GOOGLE_CLOUD_PROJECT)
                else:
                    import openai
                    _client = openai.OpenAI(
                        api_key=settings.OPENAI_API_KEY,
                        timeout=30.0,
                        max_retries=3,
                    )
                    logger.info("OpenAI client initialized (timeout=30s, max_retries=3)")
    return _client


def generate_text(
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """Generate text with a single user message."""
    if settings.use_local_llm:
        return _ollama_native_chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens,
            temperature,
        )

    client = _get_client()
    model = model or DEFAULT_MODEL

    if settings.use_vertex:
        from google.genai import types
        response = client.models.generate_content(
            model=_map_model(model),
            contents=[
                types.Content(role="user", parts=[
                    types.Part.from_text(text=f"{system_prompt}\n\n{user_prompt}"),
                ]),
            ],
            config=types.GenerateContentConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            ),
        )
        return response.text or ""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def generate_text_with_history(
    system_prompt: str,
    messages: List[dict],
    model: Optional[str] = None,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """Generate text with conversation history for context.

    Args:
        messages: List of dicts with 'role' and 'content' keys.
    """
    if settings.use_local_llm:
        return _ollama_native_chat(
            [{"role": "system", "content": system_prompt}] + messages,
            max_tokens,
            temperature,
        )

    client = _get_client()
    model = model or DEFAULT_MODEL

    if settings.use_vertex:
        from google.genai import types
        contents = [
            types.Content(role="user", parts=[types.Part.from_text(text=system_prompt)]),
            types.Content(role="model", parts=[types.Part.from_text(text="understood")]),
        ]
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            contents.append(
                types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])])
            )
        response = client.models.generate_content(
            model=_map_model(model),
            contents=contents,
            config=types.GenerateContentConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            ),
        )
        return response.text or ""

    full_messages = [{"role": "system", "content": system_prompt}] + messages
    response = client.chat.completions.create(
        model=model,
        messages=full_messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""
