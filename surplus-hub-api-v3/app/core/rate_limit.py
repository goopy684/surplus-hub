from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings


def _get_limiter() -> Limiter:
    if settings.REDIS_URL:
        return Limiter(
            key_func=get_remote_address,
            storage_uri=settings.REDIS_URL,
            # Redis down must not 500 login/upload/AI endpoints: fall back to per-process counters.
            in_memory_fallback_enabled=True,
            swallow_errors=True,
        )
    return Limiter(key_func=get_remote_address)


limiter = _get_limiter()
