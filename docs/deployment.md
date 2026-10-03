# Surplus Hub 배포 가이드

> 참고: `alan-for-edu-v2`의 ACR + Rocky Linux 9 VM + Docker Compose 패턴을 본 프로젝트(FastAPI api-v3 + Next.js standalone web + pgvector Postgres)에 맞춰 적용한다.

---

## 1. 아키텍처 개요

```
[로컬/개발자 머신]                  [Azure]                    [Rocky Linux 9 VM]
 scripts/build-push.sh  ──push──▶  ${ACR}.azurecr.io  ──pull──▶  docker compose
                                    ├─ surplus-hub-api               ├─ api    (FastAPI :8000)
                                    └─ surplus-hub-web               ├─ web    (Next.js :3000)
                                                                     ├─ db     (pgvector/pg15 :5432, vol)
                                                                     └─ nginx  (:80, :443)
```

- **레지스트리**: Azure Container Registry (기본값 `surplushubacr.azurecr.io`, env로 override)
- **런타임**: 단일 Rocky Linux 9 VM, Docker Compose 4-서비스
- **CI/CD 없음**: 빌드/배포 모두 수동 (스크립트 기반)
- **DB**: pgvector/pg15 컨테이너 + named volume 영속화

---

## 2. 구성 요소

### 2.1 docker-compose.yml (`deploy/docker-compose.yml`)

| 서비스 | 이미지 | 포트 | 비고 |
|--------|--------|------|------|
| `api` | `${ACR}/surplus-hub-api:${IMAGE_TAG:-latest}` | 8000 | gunicorn+uvicorn, alembic upgrade head 후 기동 |
| `web` | `${ACR}/surplus-hub-web:${IMAGE_TAG:-latest}` | 3000 | Next.js standalone, `wget` healthcheck |
| `db`  | `pgvector/pgvector:pg15` | 5432 (호스트 미노출) | `pgdata` 볼륨, `pg_isready` healthcheck |
| `nginx` | `nginx:1.27-alpine` | 80, 443 | `nginx-compose.conf`, `./ssl/` 마운트, api/web healthy 후 기동 |

### 2.2 스크립트

- **`scripts/build-push.sh`** — 두 이미지(api, web)를 ACR에 빌드+push
- **`scripts/setup-vm.sh`** — Rocky Linux 9 최초 1회 부트스트랩
- **`scripts/deploy.sh`** — 로컬에서 한 번에: build-push → ssh로 원격 pull/up

---

## 3. 최초 1회: VM 초기 구축

대상: Rocky Linux 9 (RHEL 계열)

```bash
# 로컬에서 VM에 scripts/setup-vm.sh 복사 후 VM 내에서 실행
scp scripts/setup-vm.sh <vm-user>@<vm-ip>:~/
ssh <vm-user>@<vm-ip>
chmod +x ~/setup-vm.sh
sudo ACR_NAME=surplushubacr ~/setup-vm.sh
```

수행 작업:
1. Docker CE + compose plugin 설치 (`dnf`)
2. Azure CLI 설치 → `az login --use-device-code` → `az acr login --name ${ACR_NAME}`
3. `~/surplus-hub/` 디렉토리 생성
4. `.env` 템플릿 배치 (`IMAGE_TAG=latest`, DB 비밀번호 등)
5. firewalld 포트 개방: 80, 443
6. (선택) `docker compose pull && docker compose up -d`

> ⚠️ `deploy/docker-compose.yml`, `deploy/nginx-compose.conf`, `deploy/ssl/`은 VM의 `~/surplus-hub/`에 별도 배치 필요. `setup-vm.sh`는 git clone을 시도하지 않으니 `scp` 또는 git으로 동기화.

---

## 4. 일상 배포 절차

### Option A — 한 줄 자동 배포 (권장)

```bash
# .env에 ACR_NAME, VM_HOST, VM_USER, VM_DEPLOY_DIR 설정 후
./scripts/deploy.sh                # latest 태그로 빌드+push+원격 재기동
./scripts/deploy.sh -t v1.0.1      # 특정 버전 태그
./scripts/deploy.sh --only api     # api만 빌드/배포
./scripts/deploy.sh --only web     # web만
```

내부 동작:
1. `scripts/build-push.sh` 실행 (로컬 빌드 + ACR push)
2. `ssh ${VM_USER}@${VM_HOST}` → `cd ${VM_DEPLOY_DIR}` → `IMAGE_TAG=<tag> docker compose pull && docker compose up -d`
3. `docker compose ps` 결과 출력

### Option B — 수동 2단계

**Step 1. 로컬 빌드 & Push**

```bash
./scripts/build-push.sh                # api, web 둘 다 latest
./scripts/build-push.sh -t v1.0.1      # 버전 태그 (latest로도 동시 푸시됨)
./scripts/build-push.sh --only api     # api만
```

내부 동작:
- `az acr login --name ${ACR_NAME}`
- `docker build --platform linux/amd64 -t ${ACR}/surplus-hub-api:${TAG} ./surplus-hub-api-v3`
- `docker build --platform linux/amd64 -t ${ACR}/surplus-hub-web:${TAG} ./surplus-hub-react`
- 비-latest 태그면 `latest`로도 태그
- 양쪽 모두 push

**Step 2. VM에서 pull & 재기동**

```bash
ssh <vm-user>@<vm-ip>
cd ~/surplus-hub

docker compose pull && docker compose up -d
# 또는 특정 버전:
IMAGE_TAG=v1.0.1 docker compose pull && docker compose up -d
```

---

## 5. 운영 명령어

```bash
docker compose ps              # 서비스 상태
docker compose logs -f         # 실시간 로그 전체
docker compose logs -f api     # api 로그만
docker compose logs -f web     # web 로그만
docker compose exec api alembic upgrade head   # DB 마이그레이션 수동 실행
docker compose exec db psql -U postgres surplushub   # DB 접속
docker compose down            # 중지 (db 볼륨 유지)
docker compose restart nginx
```

접속 경로:
- `https://<VM-IP>` — nginx (HTTPS, /api → api, / → web)
- `https://<VM-IP>/api/v1/health` — API 헬스체크
- `http://<VM-IP>` — nginx (HTTPS 리다이렉트)

---

## 6. 환경 변수 (.env)

VM의 `~/surplus-hub/.env`에 다음 항목 필요:

```bash
# Registry
ACR=surplushubacr.azurecr.io
IMAGE_TAG=latest

# DB
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<강력한_비밀번호로_교체>
POSTGRES_DB=surplushub

# API
SECRET_KEY=<production_secret>
APP_ENV=prod
CORS_ORIGINS=["https://your-domain.com"]
# 선택: Clerk / S3 / AI
# CLERK_PEM_PUBLIC_KEY=...
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# OPENAI_API_KEY=...
# GOOGLE_AI_API_KEY=...

# Web (빌드 타임 NEXT_PUBLIC_*는 web Dockerfile build-arg로 전달)
NEXT_PUBLIC_API_BASE_URL=https://your-domain.com/api/v1
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

로컬(빌드 머신)의 `.env`에는 ACR/VM 접속 정보만:

```bash
ACR_NAME=surplushubacr
ACR=surplushubacr.azurecr.io
VM_HOST=1.2.3.4
VM_USER=rocky
VM_DEPLOY_DIR=/home/rocky/surplus-hub
NEXT_PUBLIC_API_BASE_URL=https://your-domain.com/api/v1
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
```

---

## 7. 특성 / 제약

- **수동 배포**: GitHub Actions 없음. 추적은 ACR 태그 이력에 의존.
- **단일 VM**: K8s/오토스케일 없음. 다운타임 = `docker compose up -d` 동안 컨테이너 교체 순간.
- **크로스 플랫폼 빌드**: 맥(arm64)에서도 `--platform linux/amd64` 강제 → emulation 빌드 시간 ↑.
- **SSL 인증서**: `deploy/ssl/`에 수동 배치 (자동 갱신 미구성). Let's Encrypt 사용 시 `certbot --webroot` 별도 셋업.
- **롤백**: `IMAGE_TAG=<이전버전> docker compose up -d` (ACR에 이전 태그 남아있어야 함).
- **DB 마이그레이션**: api 컨테이너 진입점이 `alembic upgrade head && gunicorn ...` 형태로 자동 실행. 위험한 마이그레이션은 미리 수동 검증.

---

## 8. 트러블슈팅

| 증상 | 원인 / 조치 |
|------|-------------|
| `az acr login` 실패 | `az login --use-device-code` 재실행, 구독 권한 확인 |
| `docker compose pull` denied | ACR 토큰 만료 → VM에서 `az acr login --name ${ACR_NAME}` |
| api healthcheck 실패 | `docker compose logs api`로 alembic/gunicorn 부팅 로그 확인 |
| web healthcheck 실패 | `docker compose logs web`, `NEXT_PUBLIC_*` env 누락 의심 |
| nginx 502 | api/web이 `service_healthy` 도달 못 함. healthcheck 통과 여부 확인 |
| 방화벽 차단 | `firewall-cmd --list-ports`로 80/443 확인 |
| DB 연결 실패 | `POSTGRES_*` env 일치 여부, `db` 호스트명 사용 확인 |
| pgvector 확장 미설치 | 이미지가 `pgvector/pgvector:pg15`인지 확인, 마이그레이션이 `CREATE EXTENSION` 호출하는지 |

---

## 9. 파일 트리

```
owner/
├── docs/deployment.md              ← 이 문서
├── deploy/
│   ├── docker-compose.yml          ← 프로덕션 compose (4 서비스)
│   ├── nginx-compose.conf          ← nginx reverse proxy
│   ├── .env.example                ← VM .env 템플릿
│   └── ssl/                        ← (수동 배치) fullchain.pem, privkey.pem
├── scripts/
│   ├── build-push.sh               ← 로컬 빌드+push
│   ├── setup-vm.sh                 ← VM 부트스트랩
│   └── deploy.sh                   ← 원샷 배포
├── surplus-hub-api-v3/
│   ├── Dockerfile                  ← (기존) FastAPI
│   └── docker-entrypoint.sh        ← alembic upgrade head → gunicorn
└── surplus-hub-react/
    ├── Dockerfile                  ← (신규) Next.js standalone multi-stage
    └── .dockerignore
```
