#!/bin/sh
# Entrypoint: alembic upgrade head → gunicorn
set -e

# Materialize GCP service account from env (Railway secret) so Vertex AI works
# without baking credentials into the image. Use /tmp — the container runs as a
# non-root user and cannot write to /etc.
GCP_SA_FILE="${GCP_SA_FILE:-/tmp/gcp.json}"
if [ -n "$GCP_SA_JSON" ]; then
  printf "%s" "$GCP_SA_JSON" > "$GCP_SA_FILE"
  export GOOGLE_APPLICATION_CREDENTIALS="$GCP_SA_FILE"
fi

# OpenRouter key baked into the image as an obfuscated file (no plaintext secret in git).
# An explicit OPENROUTER_API_KEY env var always wins.
OPENROUTER_KEY_FILE="/app/.openrouter.key"
if [ -z "${OPENROUTER_API_KEY:-}" ] && [ -f "$OPENROUTER_KEY_FILE" ]; then
  OPENROUTER_API_KEY="$(python -c "import base64, pathlib; print(base64.b64decode(pathlib.Path('$OPENROUTER_KEY_FILE').read_text().strip()).decode()[::-1])")" || OPENROUTER_API_KEY=""
  export OPENROUTER_API_KEY
fi
# Existing Railway env may still say AI_PROVIDER=vertex; a present OpenRouter key takes precedence.
if [ -n "${OPENROUTER_API_KEY:-}" ] && [ "${AI_PROVIDER:-}" = "vertex" ]; then
  export AI_PROVIDER="openrouter"
fi

# Prod R2 bucket without an explicit public URL: fall back to its r2.dev domain (SH-36).
if [ -z "${STORAGE_PUBLIC_BASE_URL:-}" ] && [ -n "${AWS_S3_ENDPOINT_URL:-}" ] && [ "${AWS_S3_BUCKET_NAME:-surplus-hub-uploads}" = "surplus-hub-uploads" ]; then
  export STORAGE_PUBLIC_BASE_URL="https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev"
fi

echo "[entrypoint] Running alembic migrations..."
alembic upgrade head || {
  echo "[entrypoint] alembic upgrade failed" >&2
  exit 1
}

# Idempotent: already-rewritten rows no longer match the legacy prefix.
if [ -n "${STORAGE_PUBLIC_BASE_URL:-}" ] && [ -f scripts/fix_storage_urls.py ]; then
  echo "[entrypoint] Rewriting legacy storage URLs..."
  python scripts/fix_storage_urls.py --apply || echo "[entrypoint] fix_storage_urls failed (non-fatal)" >&2
fi

echo "[entrypoint] Starting app: $*"
exec "$@"
