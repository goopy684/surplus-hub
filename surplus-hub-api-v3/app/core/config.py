import logging
import warnings

from pydantic_settings import BaseSettings
from typing import Optional, List

_DEFAULT_SECRET = "changethis_secret_key_for_jwt"

# Known placeholder / weak secrets that must never be used outside local/test.
_INSECURE_SECRETS = {
    _DEFAULT_SECRET,
    "your-secret-key-change-this-in-production",
    "changethis",
    "secret",
    "CHANGE_ME",
}


def _is_insecure_secret(key: Optional[str]) -> bool:
    """True if SECRET_KEY is empty, a known placeholder, or too short to be safe."""
    if not key:
        return True
    k = key.strip()
    if k in _INSECURE_SECRETS:
        return True
    if k.startswith("changethis") or k.startswith("your-secret-key") or k.startswith("CHANGE_ME"):
        return True
    return len(k) < 32


class Settings(BaseSettings):
    PROJECT_NAME: str = "Surplus Hub API"
    API_V1_STR: str = "/api/v1"

    POSTGRES_SERVER: str = "db"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "surplushub"
    DATABASE_URL: Optional[str] = None

    SECRET_KEY: str = _DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Redis
    REDIS_URL: Optional[str] = None

    # CORS
    CORS_ORIGINS: List[str] = ["*"]

    # Clerk
    CLERK_PEM_PUBLIC_KEY: Optional[str] = None
    CLERK_JWKS_URL: Optional[str] = None

    # Server
    BASE_URL: str = "http://localhost:8000"
    # Public web app base URL — used to build password-reset links.
    FRONTEND_URL: str = "http://localhost:4000"
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Email (SMTP). Password-reset mail is delivered through these when APP_ENV
    # is non-local. If SMTP_HOST or EMAILS_FROM_EMAIL is unset the sender no-ops
    # with a warning — delivery stays disabled but boot is never blocked.
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_TLS: bool = True  # STARTTLS on SMTP_PORT; ignored when SMTP_PORT=465 (implicit TLS)
    EMAILS_FROM_EMAIL: Optional[str] = None
    EMAILS_FROM_NAME: str = "Surplus Hub"

    # Social auth (Google). Set the OAuth 2.0 Web client ID from Google Cloud
    # Console to enable "Sign in with Google". When unset, /auth/google returns 503.
    GOOGLE_CLIENT_ID: Optional[str] = None

    # S3 (or any S3-compatible storage, e.g. Cloudflare R2)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET_NAME: str = "surplus-hub-uploads"
    # S3-compatible endpoint (e.g. Cloudflare R2). None → AWS S3 default.
    AWS_S3_ENDPOINT_URL: Optional[str] = None
    AWS_S3_REGION: str = "ap-northeast-2"

    # Firebase
    FIREBASE_CREDENTIALS_PATH: Optional[str] = None

    # Expo push (optional — Expo accepts unauthenticated sends)
    EXPO_ACCESS_TOKEN: Optional[str] = None

    # AI Services
    APP_ENV: str = "local"  # local | dev | stage | prod
    AI_PROVIDER: str = "default"  # default | vertex
    GOOGLE_AI_API_KEY: Optional[str] = None
    GOOGLE_CLOUD_PROJECT: Optional[str] = None
    GOOGLE_CLOUD_LOCATION: str = "asia-northeast3"
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_MODEL_NAME: str = "BAAI/bge-m3"
    EMBEDDING_DIMENSION: int = 1024

    # Local LLM via Ollama (OpenAI-compatible) — used when APP_ENV=local.
    # See dev/research/local-llm-setup-guide.md.
    LOCAL_LLM_BASE_URL: str = "http://localhost:11434/v1"
    LOCAL_LLM_MODEL: str = "gemma4:12b"
    # Reasoning models (gemma4, qwen3) MUST disable "thinking" via Ollama's native
    # /api/chat, or they are slow and produce poor output (guide pitfall #1).
    LOCAL_LLM_THINK: bool = False
    LOCAL_LLM_TIMEOUT: int = 300
    # Local embedding model served by Ollama. Its output dimension must equal
    # EMBEDDING_DIMENSION / the DB vector column (bge-m3 = 1024). `ollama pull bge-m3`.
    LOCAL_EMBED_MODEL: str = "bge-m3"
    LOCAL_API_KEY: str = "ollama"  # dummy; Ollama requires no auth

    @property
    def use_vertex(self) -> bool:
        return self.AI_PROVIDER == "vertex"

    # Max upload
    MAX_UPLOAD_SIZE_MB: int = 10

    @property
    def use_local_embedding(self) -> bool:
        if self.use_vertex:
            return False
        return self.APP_ENV == "local"

    @property
    def use_local_llm(self) -> bool:
        """Use a local Ollama LLM for text generation when running locally."""
        if self.use_vertex:
            return False
        return self.APP_ENV == "local"

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"

    def __init__(self, **data):
        super().__init__(**data)
        if not self.DATABASE_URL:
            self.DATABASE_URL = f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"
        elif self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
        elif self.DATABASE_URL.startswith("postgresql://"):
            self.DATABASE_URL = self.DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
        is_prod_like = self.APP_ENV.lower() not in ("local", "test")
        if is_prod_like:
            if _is_insecure_secret(self.SECRET_KEY):
                raise ValueError(
                    f"SECRET_KEY must be a strong, unique value (>= 32 chars, not a placeholder) "
                    f"when APP_ENV={self.APP_ENV}. "
                    'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
                )
            if any(str(o).strip() == "*" for o in self.CORS_ORIGINS):
                raise ValueError(
                    f"CORS_ORIGINS must be an explicit allow-list (no '*') when APP_ENV={self.APP_ENV}."
                )
        elif self.SECRET_KEY == _DEFAULT_SECRET:
            warnings.warn(
                "SECRET_KEY is using the default value. "
                "Set a strong random SECRET_KEY in .env for production.",
                stacklevel=2,
            )
        if self.APP_ENV != "local" and not self.use_vertex and not self.OPENAI_API_KEY:
            warnings.warn(
                f"APP_ENV={self.APP_ENV} requires OPENAI_API_KEY for embedding. "
                "Set OPENAI_API_KEY in .env or embedding will fail.",
                stacklevel=2,
            )
        if self.use_vertex and not self.GOOGLE_CLOUD_PROJECT:
            warnings.warn(
                "AI_PROVIDER=vertex requires GOOGLE_CLOUD_PROJECT. "
                "Set it in .env or Vertex AI calls will fail.",
                stacklevel=2,
            )

settings = Settings()
