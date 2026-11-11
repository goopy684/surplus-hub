#!/usr/bin/env bash
# One-shot deploy: ssh to VM → git pull (monorepo) → docker compose build+up.
#
# Usage:
#   ./scripts/deploy.sh                       # main, build on VM
#   ./scripts/deploy.sh -b develop            # other branch
#   ./scripts/deploy.sh -t v1.0.1             # image tag for built images
#   ./scripts/deploy.sh --only api            # api only
#   ./scripts/deploy.sh --skip-build          # pull prebuilt images from ACR instead of building
#
# Requires .env at repo root with:
#   VM_HOST, VM_USER, VM_DEPLOY_DIR (optional), ACR_NAME/ACR (optional, registry name for image tags)
# VM_DEPLOY_DIR must be a git clone of this repo; runtime env lives in $VM_DEPLOY_DIR/deploy/.env.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

ACR="${ACR:-${ACR_NAME:+${ACR_NAME}.azurecr.io}}"
: "${VM_HOST:?VM_HOST is required}"
: "${VM_USER:?VM_USER is required}"
VM_DEPLOY_DIR="${VM_DEPLOY_DIR:-/home/$VM_USER/surplus-hub}"

BRANCH="main"
TAG="latest"
ONLY=""
SKIP_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--branch)      BRANCH="$2"; shift 2 ;;
    -t|--tag)         TAG="$2"; shift 2 ;;
    --only)           ONLY="$2"; shift 2 ;;
    --skip-build)     SKIP_BUILD=1; shift ;;
    -h|--help)        sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

echo "==> Target: ${VM_USER}@${VM_HOST}:${VM_DEPLOY_DIR}"
echo "==> Branch: $BRANCH  Tag: $TAG  Only: ${ONLY:-all}  SkipBuild: $SKIP_BUILD"

if [[ $SKIP_BUILD -eq 1 ]]; then
  UP="docker compose pull $ONLY && docker compose up -d --remove-orphans $ONLY"
else
  UP="docker compose up -d --build --remove-orphans $ONLY"
fi

SSH="ssh -o StrictHostKeyChecking=accept-new ${VM_USER}@${VM_HOST}"

echo ""
echo "==> Remote: git pull & compose up"
$SSH bash -se <<EOF
set -euo pipefail
cd "$VM_DEPLOY_DIR"
git fetch --prune origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
# setup-vm.sh writes .env at repo root; compose now reads deploy/.env.
if [[ ! -f deploy/.env && -f .env ]]; then cp .env deploy/.env; fi
# Same for TLS certs: setup-vm.sh made ssl/ at repo root; nginx mounts deploy/ssl.
if [[ -d ssl ]]; then mkdir -p deploy/ssl && cp -rn ssl/. deploy/ssl/ 2>/dev/null || cp -a ssl/. deploy/ssl/; fi
cd deploy
export IMAGE_TAG="$TAG"
${ACR:+export ACR="$ACR"}
$UP
docker compose ps
EOF

echo ""
echo "✓ Deployed '$BRANCH' (tag '$TAG') to ${VM_HOST}"
