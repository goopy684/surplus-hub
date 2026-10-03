#!/usr/bin/env bash
# Bootstrap a Rocky Linux 9 VM to host the Surplus Hub stack.
# Run ONCE on the VM as a sudoer:
#   sudo ACR_NAME=surplushubacr ./setup-vm.sh
#
# Idempotent: skips steps already done.

set -euo pipefail

ACR_NAME="${ACR_NAME:-surplushubacr}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/$DEPLOY_USER/surplus-hub}"

echo "==> ACR_NAME=$ACR_NAME"
echo "==> DEPLOY_USER=$DEPLOY_USER"
echo "==> DEPLOY_DIR=$DEPLOY_DIR"

# --- 1. Docker CE + compose plugin ---
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker CE"
  dnf install -y dnf-plugins-core
  dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "==> Docker already installed: $(docker --version)"
fi

# allow deploy user to run docker
if ! id -nG "$DEPLOY_USER" | grep -qw docker; then
  usermod -aG docker "$DEPLOY_USER"
  echo "==> Added $DEPLOY_USER to docker group (re-login required)"
fi

# --- 2. Azure CLI ---
if ! command -v az >/dev/null 2>&1; then
  echo "==> Installing Azure CLI"
  rpm --import https://packages.microsoft.com/keys/microsoft.asc
  dnf install -y https://packages.microsoft.com/config/rhel/9.0/packages-microsoft-prod.rpm
  dnf install -y azure-cli
else
  echo "==> Azure CLI already installed: $(az --version | head -1)"
fi

# --- 3. Deploy directory + .env template ---
mkdir -p "$DEPLOY_DIR/ssl"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$DEPLOY_DIR"

if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
  cat >"$DEPLOY_DIR/.env" <<EOF
ACR=${ACR_NAME}.azurecr.io
IMAGE_TAG=latest

POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-me-$(openssl rand -hex 8)
POSTGRES_DB=surplushub

APP_ENV=prod
SECRET_KEY=change-me-$(openssl rand -hex 16)
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
API_V1_STR=/api/v1
PROJECT_NAME=Surplus Hub API
CORS_ORIGINS=["*"]
MAX_UPLOAD_SIZE_MB=10
AI_PROVIDER=default
EMBEDDING_MODEL_NAME=BAAI/bge-m3
EMBEDDING_DIMENSION=1024

NEXT_PUBLIC_API_BASE_URL=https://your-domain.com/api/v1
EOF
  chown "$DEPLOY_USER":"$DEPLOY_USER" "$DEPLOY_DIR/.env"
  chmod 600 "$DEPLOY_DIR/.env"
  echo "==> Wrote $DEPLOY_DIR/.env (review and edit secrets!)"
else
  echo "==> $DEPLOY_DIR/.env already exists, skipping"
fi

# --- 4. firewalld ports ---
if systemctl is-active --quiet firewalld; then
  for port in 80 443; do
    if ! firewall-cmd --list-ports | grep -qw "${port}/tcp"; then
      firewall-cmd --permanent --add-port=${port}/tcp
    fi
  done
  firewall-cmd --reload
  echo "==> firewalld: $(firewall-cmd --list-ports)"
fi

# --- 5. ACR login (interactive device code) ---
echo ""
echo "==> Next: run as $DEPLOY_USER:"
echo "      az login --use-device-code"
echo "      az acr login --name $ACR_NAME"
echo ""
echo "==> Then copy deploy/docker-compose.yml, deploy/nginx-compose.conf, deploy/ssl/* to $DEPLOY_DIR"
echo "==> Finally:  cd $DEPLOY_DIR && docker compose pull && docker compose up -d"
