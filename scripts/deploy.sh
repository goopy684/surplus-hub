#!/usr/bin/env bash
# One-shot deploy: build+push locally → ssh to VM → pull+up.
#
# Usage:
#   ./scripts/deploy.sh                       # latest
#   ./scripts/deploy.sh -t v1.0.1             # version tag
#   ./scripts/deploy.sh --only api            # api only
#   ./scripts/deploy.sh --skip-build          # remote pull/up only
#   ./scripts/deploy.sh --sync-compose        # also scp deploy/* to VM_DEPLOY_DIR before up
#
# Requires .env at repo root with:
#   ACR_NAME, ACR, VM_HOST, VM_USER, VM_DEPLOY_DIR

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

: "${ACR_NAME:?ACR_NAME is required (set in .env)}"
ACR="${ACR:-${ACR_NAME}.azurecr.io}"
: "${VM_HOST:?VM_HOST is required}"
: "${VM_USER:?VM_USER is required}"
VM_DEPLOY_DIR="${VM_DEPLOY_DIR:-/home/$VM_USER/surplus-hub}"

TAG="latest"
ONLY=""
SKIP_BUILD=0
SYNC_COMPOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--tag)         TAG="$2"; shift 2 ;;
    --only)           ONLY="$2"; shift 2 ;;
    --skip-build)     SKIP_BUILD=1; shift ;;
    --sync-compose)   SYNC_COMPOSE=1; shift ;;
    -h|--help)        sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

echo "==> Target: ${VM_USER}@${VM_HOST}:${VM_DEPLOY_DIR}"
echo "==> Tag: $TAG  Only: ${ONLY:-both}  SkipBuild: $SKIP_BUILD  SyncCompose: $SYNC_COMPOSE"

if [[ $SKIP_BUILD -eq 0 ]]; then
  args=(-t "$TAG")
  [[ -n "$ONLY" ]] && args+=(--only "$ONLY")
  ./scripts/build-push.sh "${args[@]}"
fi

SSH="ssh -o StrictHostKeyChecking=accept-new ${VM_USER}@${VM_HOST}"

if [[ $SYNC_COMPOSE -eq 1 ]]; then
  echo ""
  echo "==> rsync deploy/ → ${VM_HOST}:${VM_DEPLOY_DIR}"
  rsync -avz --exclude 'ssl/*.pem' --exclude '.env' deploy/ "${VM_USER}@${VM_HOST}:${VM_DEPLOY_DIR}/"
fi

echo ""
echo "==> Remote: pull & up"
$SSH bash -se <<EOF
set -euo pipefail
cd "$VM_DEPLOY_DIR"
export IMAGE_TAG="$TAG"
docker compose pull
docker compose up -d --remove-orphans
docker compose ps
EOF

echo ""
echo "✓ Deployed tag '$TAG' to ${VM_HOST}"
