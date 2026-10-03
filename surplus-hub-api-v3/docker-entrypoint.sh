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

echo "[entrypoint] Running alembic migrations..."
alembic upgrade head || {
  echo "[entrypoint] alembic upgrade failed" >&2
  exit 1
}

echo "[entrypoint] Starting app: $*"
exec "$@"
