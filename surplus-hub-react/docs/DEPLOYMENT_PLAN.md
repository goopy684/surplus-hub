# Surplus Hub — 배포 Runbook (Claude Code 실행용)

> **대상**: Claude Code가 단계별로 직접 실행. 각 단계는 (1) 사전 점검 → (2) 실행 명령 → (3) 검증으로 구성. 사용자 액션은 **🛑 USER** 마크.
> **목표 조합**: Vercel (Frontend) + Railway (Backend + Postgres) + Cloudflare R2 (Files)
> **사용자 액션 3건**: ①토큰 3종 발급 (GitHub/Railway/Vercel) ②R2 API 토큰 (Cloudflare 대시보드) ③Google OAuth 클라이언트 ID (Google Cloud Console)
> **예상 소요**: 사용자 액션 ~30분 + 자동 실행 ~1시간 = 총 약 1시간 30분
> **작성일**: 2026-05-19 (2026-07-15 갱신: Clerk 제거 → 자체 인증 + Google OAuth 반영)

---

## 🛑 사용자가 해야 할 일 (시작 전 한 번에)

다음 3개를 미리 준비하면 Claude Code가 그 후 끝까지 자동 진행합니다.

### A. 토큰 3종 발급 (~10분)
1. **GitHub Personal Access Token** — https://github.com/settings/tokens/new
   - Scopes: `repo`, `workflow`
   - 생성 후: `export GH_TOKEN=ghp_xxx`
2. **Railway API Token** — https://railway.app/account/tokens (계정 가입 필요)
   - `export RAILWAY_TOKEN=...`
3. **Vercel Token** — https://vercel.com/account/tokens (계정 가입 필요)
   - `export VERCEL_TOKEN=...`

### B. Cloudflare R2 토큰 발급 (~5분)
1. Cloudflare 계정 가입 + R2 활성화 (신용카드 등록 필요, 사용 안 하면 과금 0)
2. https://dash.cloudflare.com → R2 → **Manage R2 API Tokens** → Create
3. Permissions: **Object Read & Write**, Bucket: **Specify (surplus-hub-uploads는 Claude Code가 만들 예정 — 이름만 입력)**
4. 발급된 3개 값 저장: Access Key ID / Secret Access Key / Endpoint URL

### C. Google OAuth 클라이언트 ID (~10분)
인증은 자체 구현(이메일/비밀번호 + Google ID token)이라 Clerk는 더 이상 쓰지 않습니다. Google 로그인용 OAuth 클라이언트만 있으면 됩니다.
1. https://console.cloud.google.com → APIs & Services → Credentials → **Create OAuth client ID** (Web application)
2. **Authorized JavaScript origins**에 배포 도메인 추가: Vercel 도메인(`https://<project>.vercel.app`) + `http://localhost:4000`(로컬)
3. 발급된 Client ID 저장 (client secret은 불필요 — 백엔드는 ID token 검증만 수행):
   `export GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com`
   같은 값이 백엔드 `GOOGLE_CLIENT_ID`와 프론트 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`에 들어갑니다.
4. (선택) 비밀번호 재설정 메일 발송용 SMTP 자격증명 — SMTP_HOST/PORT/USER/PASSWORD, EMAILS_FROM_EMAIL (미설정 시 메일만 발송 안 되고 서비스는 정상)

준비 끝나면 위 모든 값을 메모해두고, Claude Code에 "DEPLOYMENT_PLAN.md 따라 배포해" 한 줄 던지면 됩니다.

---

## 0. 사전 환경 점검

Claude Code가 실행 환경에 도구가 있는지 먼저 확인:

```bash
# 모든 명령 한 번에
for cmd in git gh node npm bun docker python3 jq curl openssl; do
  printf '%-10s ' "$cmd"; command -v "$cmd" >/dev/null 2>&1 && echo "✓ $($cmd --version 2>&1 | head -1)" || echo "✗ MISSING"
done

# Vercel/Railway/Wrangler CLI 확인
for cmd in vercel railway wrangler; do
  printf '%-10s ' "$cmd"; command -v "$cmd" >/dev/null 2>&1 && echo "✓ $($cmd --version 2>&1 | head -1)" || echo "✗ INSTALL NEEDED"
done
```

누락된 CLI 설치:
```bash
npm i -g vercel @railway/cli wrangler
```

GitHub/Railway/Vercel 인증 (모두 env var로):
```bash
# 사용자가 시작 전에 export한 GH_TOKEN / RAILWAY_TOKEN / VERCEL_TOKEN 검증
for v in GH_TOKEN RAILWAY_TOKEN VERCEL_TOKEN; do
  printf '%-15s ' "$v"
  [ -n "${!v}" ] && echo "✓ set (${#v} chars)" || { echo "✗ MISSING — see 🛑 사용자가 해야 할 일 §A"; exit 1; }
done

gh auth status   # GH_TOKEN이 set돼 있으면 자동 인식
```

---

## 1. GitHub 레포 push (양쪽 모두)

각 레포에서:

```bash
cd /Users/jeongseongchae/dev/owner/surplus-hub-react
git status
git init -q 2>/dev/null || true
[ -d .git ] && [ -z "$(git config user.email)" ] && git config user.email "goopy684@gmail.com" && git config user.name "Surplus Hub"
gh repo view 2>/dev/null || gh repo create surplus-hub-react --private --source=. --remote=origin --push   # GH_TOKEN으로 자동
git add -A && git diff --cached --quiet || git commit -m "chore: prepare for vercel deploy"
git push -u origin HEAD
```

백엔드도 동일하게 (디렉토리만 바꿔서):
```bash
cd /Users/jeongseongchae/dev/owner/surplus-hub-api-v3
git status
gh repo view 2>/dev/null || gh repo create surplus-hub-api-v3 --private --source=. --remote=origin --push
git add -A && git diff --cached --quiet || git commit -m "chore: prepare for railway deploy"
git push -u origin HEAD
```

---

## 2. Backend 코드 수정 (배포 전 1회 패치)

### 2.1 `gunicorn.conf.py` — 워커 수 고정
```bash
python3 -c "
import pathlib
p = pathlib.Path('/Users/jeongseongchae/dev/owner/surplus-hub-api-v3/gunicorn.conf.py')
s = p.read_text()
if 'multiprocessing.cpu_count' in s:
    s = s.replace('workers = multiprocessing.cpu_count() * 2 + 1', 'workers = int(__import__(\"os\").getenv(\"WEB_CONCURRENCY\", \"2\"))')
    p.write_text(s)
    print('patched')
else:
    print('already patched')
"
```

### 2.2 `config.py` — R2 endpoint URL 옵션 추가
```bash
python3 -c "
import pathlib
p = pathlib.Path('/Users/jeongseongchae/dev/owner/surplus-hub-api-v3/app/core/config.py')
s = p.read_text()
if 'AWS_S3_ENDPOINT_URL' not in s:
    s = s.replace('AWS_S3_REGION:', 'AWS_S3_ENDPOINT_URL: Optional[str] = None\n    AWS_S3_REGION:', 1)
    p.write_text(s)
    print('patched')
else:
    print('already has AWS_S3_ENDPOINT_URL')
"
```

### 2.3 S3 클라이언트가 endpoint URL 사용하도록
```bash
# 1) S3 클라이언트 초기화 위치 찾기
grep -rn 'boto3.client(\|boto3\.resource(' /Users/jeongseongchae/dev/owner/surplus-hub-api-v3/app | head -10
```

찾은 파일에서 `boto3.client("s3", ...)` 호출을 다음으로 교체:
```python
boto3.client(
    "s3",
    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    endpoint_url=settings.AWS_S3_ENDPOINT_URL,   # R2에선 필수, S3에선 None이면 무시
    region_name=settings.AWS_S3_REGION,
)
```

### 2.4 `docker-entrypoint.sh` — GCP 서비스 계정 secret 풀기
```bash
ENT=/Users/jeongseongchae/dev/owner/surplus-hub-api-v3/docker-entrypoint.sh
grep -q 'GCP_SA_JSON' "$ENT" || python3 -c "
import pathlib
p = pathlib.Path('$ENT')
s = p.read_text()
s = s.replace('set -e', 'set -e\n\n# Materialize GCP service account from env (Railway secret)\nif [ -n \"\$GCP_SA_JSON\" ] && [ ! -f /etc/secrets/gcp.json ]; then\n  mkdir -p /etc/secrets\n  printf \"%s\" \"\$GCP_SA_JSON\" > /etc/secrets/gcp.json\n  export GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/gcp.json\nfi', 1)
p.write_text(s)
print('patched')
"
```

### 2.5 `railway.json` 생성 (Railway 빌드 설정)
```bash
cat > /Users/jeongseongchae/dev/owner/surplus-hub-api-v3/railway.json <<'JSON'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "/app/docker-entrypoint.sh gunicorn app.main:app -c gunicorn.conf.py",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "numReplicas": 1
  }
}
JSON
```

### 2.6 커밋 + push
```bash
cd /Users/jeongseongchae/dev/owner/surplus-hub-api-v3
git add -A && git commit -m "feat: railway + r2 deploy support"
git push
```

---

## 3. Cloudflare R2 셋업

### 3.1 Wrangler 인증 — Cloudflare API Token 사용 (브라우저 OAuth 대체)
사용자가 §B에서 R2 토큰 받을 때 같은 페이지에서 "Account API Token"도 발급해두면 wrangler가 비대화식으로 동작:
```bash
# 사용자가 Cloudflare API Token (Account level)을 발급해서 export
# 없으면 wrangler login으로 폴백
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
  wrangler whoami
else
  wrangler login   # 폴백: 브라우저 OAuth (R2 토큰만 발급한 경우)
fi
```

### 3.2 버킷 생성
```bash
wrangler r2 bucket create surplus-hub-uploads
wrangler r2 bucket list | grep surplus-hub-uploads
```

### 3.3 CORS 정책 적용
```bash
cat > /tmp/r2-cors.json <<'JSON'
[
  {
    "AllowedOrigins": ["https://*.vercel.app", "http://localhost:4000", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
JSON
wrangler r2 bucket cors put surplus-hub-uploads --file /tmp/r2-cors.json
wrangler r2 bucket cors list surplus-hub-uploads
```

### 3.4 R2 API 토큰 확인 (사용자가 §B에서 이미 발급)
사용자가 미리 export 해뒀어야 함:
```bash
for v in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT; do
  printf '%-25s ' "$v"
  [ -n "${!v}" ] && echo "✓ set" || { echo "✗ MISSING — see 🛑 §B"; exit 1; }
done
```

### 3.5 (선택) Public access — 도메인 연결
도메인이 있을 때만:
```bash
wrangler r2 bucket domain add surplus-hub-uploads --domain cdn.surplushub.kr
# 도메인 없으면 skip — Presigned URL 방식으로 진행
```

---

## 4. Backend Railway 배포

### 4.1 Railway 프로젝트 생성 (RAILWAY_TOKEN으로 비대화식)
```bash
cd /Users/jeongseongchae/dev/owner/surplus-hub-api-v3
# RAILWAY_TOKEN 환경변수가 있으면 모든 명령 비대화식
railway whoami
PROJECT_NAME="surplus-hub-api-v3"
railway init --name "$PROJECT_NAME" 2>/dev/null || railway link --project "$PROJECT_NAME"
```

### 4.2 Postgres 플러그인 추가
```bash
railway add --plugin postgresql
railway variables get DATABASE_URL    # 자동 생성된 URL 확인
```

### 4.3 pgvector 확장 활성화
```bash
railway connect Postgres <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
SQL
```
**pgvector 미지원 에러 시 (Plan B)**: Supabase 무료 티어로 이전.
```bash
# 사용자에게 알리고 https://supabase.com/dashboard 에서 프로젝트 생성 → DATABASE_URL 받기
read -p "Supabase DATABASE_URL: " DATABASE_URL_OVERRIDE     # 🛑 USER INPUT
railway variables set DATABASE_URL="$DATABASE_URL_OVERRIDE"
```

### 4.4 환경 변수 일괄 설정
GCP 서비스 계정 JSON 경로 (로컬에서 사용 중이던 것):
```bash
GCP_SA_PATH=/Users/jeongseongchae/dev/owner/service-account.json
[ -f "$GCP_SA_PATH" ] || { echo "ERROR: service account JSON not found at $GCP_SA_PATH"; exit 1; }
GCP_SA_JSON="$(cat "$GCP_SA_PATH")"

SECRET_KEY="$(openssl rand -hex 32)"

# Google OAuth 클라이언트 ID (사용자가 §C에서 미리 export 해뒀어야 함)
[ -n "$GOOGLE_OAUTH_CLIENT_ID" ] || { echo "✗ GOOGLE_OAUTH_CLIENT_ID 누락 — 🛑 §C에서 export 후 재실행"; exit 1; }

railway variables set \
  APP_ENV=prod \
  SECRET_KEY="$SECRET_KEY" \
  ALGORITHM=HS256 \
  ACCESS_TOKEN_EXPIRE_MINUTES=60 \
  CORS_ORIGINS='["https://*.vercel.app","http://localhost:4000"]' \
  AI_PROVIDER=vertex \
  GOOGLE_CLOUD_PROJECT=est-alan-451902 \
  GOOGLE_CLOUD_LOCATION=us-central1 \
  GCP_SA_JSON="$GCP_SA_JSON" \
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  AWS_S3_BUCKET_NAME=surplus-hub-uploads \
  AWS_S3_REGION=auto \
  AWS_S3_ENDPOINT_URL="$R2_ENDPOINT" \
  MAX_UPLOAD_SIZE_MB=10 \
  GOOGLE_CLIENT_ID="$GOOGLE_OAUTH_CLIENT_ID" \
  WEB_CONCURRENCY=2

# FRONTEND_URL은 비밀번호 재설정 링크 생성에 쓰인다 — Vercel URL 확정 후(§6.2 다음) 설정:
#   railway variables set FRONTEND_URL="https://<project>.vercel.app"
# (선택) SMTP 메일 발송 — §C-4에서 준비한 값이 있으면:
#   railway variables set SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASSWORD=... EMAILS_FROM_EMAIL=...
```

### 4.5 배포 트리거
```bash
railway up --detach
railway logs --tail 50      # 빌드/마이그레이션 로그 모니터링
```

### 4.6 도메인 발급 + 검증
```bash
railway domain              # *.up.railway.app 도메인 자동 발급
RAILWAY_URL="https://$(railway status --json | jq -r '.deployments[0].url // .url' 2>/dev/null)"
[ -z "$RAILWAY_URL" ] || [ "$RAILWAY_URL" = "https://null" ] && read -p "Railway URL (위 명령 출력 보고 입력): " RAILWAY_URL

curl -sf "$RAILWAY_URL/health" | jq .
# 기대값: {"status":"ok","checks":{"api":"ok","database":"ok"}}

curl -sf "$RAILWAY_URL/api/v1/categories/" | jq '. | length'
# 기대값: 1 이상 (카테고리 seed 있으면)
```

마이그레이션이 실행되지 않은 경우 (DB 빈 경우):
```bash
railway run alembic upgrade head
```

---

## 5. Frontend 코드 수정

### 5.1 API base URL을 NEXT_PUBLIC_API_URL로 통일 확인
```bash
grep -rn "NEXT_PUBLIC_API_URL\|DEFAULT_API_BASE_URL" /Users/jeongseongchae/dev/owner/surplus-hub-react/packages/core/src/api/client.ts
# 이미 process.env.NEXT_PUBLIC_API_URL 읽도록 되어 있어야 함 (소스 확인됨)
```

### 5.2 next.config 점검 (standalone 제거 — Vercel 불필요)
```bash
NC=/Users/jeongseongchae/dev/owner/surplus-hub-react/apps/web/next.config.mjs
[ -f "$NC" ] || NC=/Users/jeongseongchae/dev/owner/surplus-hub-react/apps/web/next.config.js
grep -n "output.*standalone" "$NC" || echo "standalone 없음 (Vercel OK)"
# 있으면 제거:
python3 -c "
import pathlib, re
p = pathlib.Path('$NC')
s = p.read_text()
s = re.sub(r'\s*output:\s*[\"\\']standalone[\"\\'],?\s*', '', s)
p.write_text(s)
print('cleaned')
" 2>/dev/null || true
```

### 5.3 `.env.production.local` 템플릿 (Vercel UI에서 입력할 키 목록)
```bash
cat > /Users/jeongseongchae/dev/owner/surplus-hub-react/apps/web/.env.production.example <<'ENV'
# Set these in Vercel → Project → Settings → Environment Variables
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
NEXT_PUBLIC_API_URL=https://<railway-domain>.up.railway.app
ENV
```

### 5.4 (선택) `railway.toml` 무력화 (Vercel과 충돌 방지)
```bash
RT=/Users/jeongseongchae/dev/owner/surplus-hub-react/railway.toml
[ -f "$RT" ] && mv "$RT" "$RT.bak" && echo "railway.toml → .bak (Vercel 사용)"
```

### 5.5 커밋 + push
```bash
cd /Users/jeongseongchae/dev/owner/surplus-hub-react
git add -A && git diff --cached --quiet || git commit -m "feat: vercel deploy support, R2 backend wiring"
git push
```

---

## 6. Frontend Vercel 배포

### 6.1 Vercel 프로젝트 연결 (VERCEL_TOKEN 비대화식)
```bash
cd /Users/jeongseongchae/dev/owner/surplus-hub-react
vercel whoami --token "$VERCEL_TOKEN"
vercel link --yes --token "$VERCEL_TOKEN" --project surplus-hub-react   # 자동 생성/연결
```

### 6.2 환경변수 설정 (CLI로 일괄)
```bash
# Railway URL 자동 사용
echo "$RAILWAY_URL"   # 위 4.6에서 export됨

vercel env add NEXT_PUBLIC_GOOGLE_CLIENT_ID production <<< "$GOOGLE_OAUTH_CLIENT_ID"
vercel env add NEXT_PUBLIC_API_URL production <<< "$RAILWAY_URL"

# Preview/Development도 동일하게
for ENV in preview development; do
  vercel env add NEXT_PUBLIC_GOOGLE_CLIENT_ID $ENV <<< "$GOOGLE_OAUTH_CLIENT_ID"
  vercel env add NEXT_PUBLIC_API_URL $ENV <<< "$RAILWAY_URL"
done

# Vercel URL 확정 후 백엔드 FRONTEND_URL 설정 (§4.4 주석 참고):
#   railway variables set FRONTEND_URL="https://<project>.vercel.app"
```

### 6.3 빌드 설정 — `vercel.json`을 repo에 commit (대시보드 불필요)
```bash
cat > /Users/jeongseongchae/dev/owner/surplus-hub-react/vercel.json <<'JSON'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "cd ../.. && npx turbo run build --filter=web",
  "installCommand": "npm install --legacy-peer-deps",
  "framework": "nextjs",
  "outputDirectory": "apps/web/.next"
}
JSON
# Root Directory는 vercel link 단계에서 --cwd apps/web을 쓰거나, 다음과 같이 project json에 명시
cat > /Users/jeongseongchae/dev/owner/surplus-hub-react/.vercel/project.json <<'JSON' 2>/dev/null || true
{ "rootDirectory": "apps/web" }
JSON
git add vercel.json .vercel/project.json 2>/dev/null
git commit -m "feat: vercel.json — monorepo build config" 2>/dev/null
git push 2>/dev/null
```

### 6.4 배포
```bash
vercel --prod
# 배포 URL 출력됨: https://surplus-hub-react.vercel.app
VERCEL_URL="https://$(vercel ls --json | jq -r '.[0].url' 2>/dev/null)"
```

### 6.5 Backend CORS에 Vercel URL 추가
```bash
cd /Users/jeongseongchae/dev/owner/surplus-hub-api-v3
NEW_CORS="[\"$VERCEL_URL\",\"https://*.vercel.app\",\"http://localhost:4000\"]"
railway variables set CORS_ORIGINS="$NEW_CORS"
railway redeploy
```

---

## 7. End-to-end 검증

### 7.1 Backend health
```bash
curl -sf "$RAILWAY_URL/health" | jq .
curl -sf "$RAILWAY_URL/api/v1/categories/" | jq '. | length'
curl -sf "$RAILWAY_URL/api/v1/materials/?page=1&limit=5" | jq '.data | length'
```

### 7.2 Frontend smoke (browse CLI 사용)
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto "$VERCEL_URL" >/dev/null && sleep 5
$B snapshot 2>&1 | grep -E "잉여자재|로그인|커뮤니티" | head -5
$B console --errors 2>&1 | grep -cE "401|Failed|Error" || echo "0 errors"
$B screenshot /tmp/deploy-verify-home.png 2>&1 | tail -1

# 보호 라우트 게이트 확인
$B goto "$VERCEL_URL/chat" >/dev/null && sleep 4
$B snapshot 2>&1 | grep "로그인 하러 가기"
```

### 7.3 R2 업로드 경로 확인
```bash
# API에서 presigned URL 요청 → R2 endpoint URL이 응답에 포함되는지
curl -sf -X POST "$RAILWAY_URL/api/v1/upload/presign" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.jpg","contentType":"image/jpeg"}' | jq .
# uploadUrl이 *.r2.cloudflarestorage.com 으로 시작하면 OK
```

### 7.4 자동 검증 스크립트
```bash
cat > /tmp/deploy-verify.sh <<'BASH'
#!/bin/bash
set -e
FAIL=0
check() { printf '%-50s ' "$1"; if eval "$2" >/dev/null 2>&1; then echo "✓"; else echo "✗"; FAIL=$((FAIL+1)); fi; }

check "Backend /health"        "curl -sf $RAILWAY_URL/health | jq -e '.status==\"ok\"'"
check "Backend /categories"    "curl -sf $RAILWAY_URL/api/v1/categories/"
check "Backend /materials"     "curl -sf $RAILWAY_URL/api/v1/materials/?page=1&limit=1"
check "Frontend root 200"      "curl -sfo /dev/null $VERCEL_URL"
check "Frontend serves HTML"   "curl -sf $VERCEL_URL | grep -q '잉여자재'"

echo
[ $FAIL -eq 0 ] && echo "🎉 All checks passed" || { echo "❌ $FAIL check(s) failed"; exit 1; }
BASH
chmod +x /tmp/deploy-verify.sh
/tmp/deploy-verify.sh
```

---

## 8. 도메인 연결 (선택 — 도메인 보유 시)

### 8.1 Vercel 도메인
```bash
vercel domains add app.surplushub.kr            # 🛑 USER INPUT (소유 확인)
# Vercel이 알려주는 CNAME 값을 도메인 등록기관에 입력
```

### 8.2 Railway 도메인
```bash
railway domain add api.surplushub.kr            # 🛑 USER INPUT
# Railway가 알려주는 CNAME 값을 도메인 등록기관에 입력
```

### 8.3 R2 도메인 (CDN)
```bash
wrangler r2 bucket domain add surplus-hub-uploads --domain cdn.surplushub.kr   # 🛑 USER INPUT
```

### 8.4 환경변수 도메인으로 갱신
```bash
vercel env rm NEXT_PUBLIC_API_URL production -y
vercel env add NEXT_PUBLIC_API_URL production <<< "https://api.surplushub.kr"
vercel --prod    # 재배포

railway variables set CORS_ORIGINS='["https://app.surplushub.kr"]'
railway redeploy
```

---

## 9. 트러블슈팅 플레이북 (Claude Code 자가진단)

| 증상 | 진단 | 해결 |
|---|---|---|
| `railway up` 빌드 OOM | `railway logs` 마지막 라인에 `Killed` | `requirements.txt`에서 임시로 무거운 dev deps 분리, 또는 Hobby → Pro 일시 |
| `/health` 응답 200인데 `/api/v1/*` 404 | API_V1_STR 환경변수 누락 | `railway variables set API_V1_STR=/api/v1` |
| 프론트에서 CORS 차단 | 콘솔에 `Access-Control-Allow-Origin` 오류 | Backend CORS_ORIGINS에 Vercel URL 추가 후 `railway redeploy` |
| Vercel 빌드 `Cannot find module @repo/core` | Turborepo 빌드 미실행 | Build Command를 `cd ../.. && npx turbo run build --filter=web`로 |
| R2 PUT 403 | CORS 설정 또는 token 권한 | `wrangler r2 bucket cors list surplus-hub-uploads`로 확인, 토큰 권한 Object R/W 재확인 |
| Vertex AI 401/403 | GCP_SA_JSON 누락 또는 권한 부족 | Railway shell에서 `cat /etc/secrets/gcp.json | jq .client_email`로 토큰 유효성 확인 |
| 마이그레이션 미실행 | `psql $DATABASE_URL -c "\dt"` 결과 빈 테이블 | `railway run alembic upgrade head` |
| 모든 페이지 500 | `railway logs --tail 100` 최근 에러 | 99%는 환경변수 누락 — `railway variables` 출력 확인 |

자가진단 명령:
```bash
railway logs --tail 100 | grep -iE "error|fail|critical" | head -20
vercel logs <deployment-url> | grep -iE "error|fail" | head -20
```

---

## 10. 롤백 (5분 이내)

### 10.1 Vercel
```bash
vercel rollback                              # 🛑 USER INPUT (이전 배포 선택)
# 또는 대시보드 → Deployments → 이전 배포 → "Promote to Production"
```

### 10.2 Railway
```bash
railway deployments                         # 배포 목록
railway redeploy --deployment <previous-id>
```

### 10.3 DB 스키마 롤백
```bash
railway run alembic downgrade -1            # 가장 최근 마이그레이션 한 단계 되돌리기
```

---

## 11. 출시 후 1주차 자동화 (별도 PR)

```bash
# 11.1 Sentry 추가 (10분)
npm i --workspace apps/web @sentry/nextjs
pip install sentry-sdk[fastapi]   # 백엔드 requirements.txt에 추가

# 11.2 Railway 백업 cron (무료 티어용)
# scripts/backup.sh 작성 후 GitHub Actions schedule trigger로 매일 03:00 KST pg_dump → R2 업로드

# 11.3 Cloudflare 앞단 (DDoS 방어)
# 도메인 네임서버를 Cloudflare로 옮기면 자동 적용
```

---

## 12. 비용 모니터링 가이드

| 임계값 | 액션 |
|---|---|
| Railway 사용량 $4 도달 (월 $5 크레딧의 80%) | 알림 받고 워커 수 점검 |
| Vercel bandwidth 80GB/월 | 이미지 최적화 + CDN 캐시 헤더 강화 |
| R2 저장 8GB/월 | 30일 이상 안 본 자재 사진 삭제 cron |
| Vertex 토큰 50M/월 | 동일 텍스트 임베딩 Redis 캐싱 (이미 translate에 있음, 임베딩에도 확장) |

---

## 13. 실행 체크리스트 (한눈에)

Claude Code가 처음부터 순서대로:

- [ ] §0 환경 점검 (Vercel/Railway/Wrangler CLI 설치)
- [ ] §1 GitHub repo push (양쪽)
- [ ] §2 Backend 코드 패치 (5건) + push
- [ ] §3 R2 버킷 + CORS + 🛑 토큰 발급
- [ ] §4 Railway 프로젝트 + Postgres + 환경변수 + 배포 + 검증
- [ ] §5 Frontend 코드 패치 + push
- [ ] §6 Vercel 프로젝트 + 환경변수 + 🛑 빌드 설정 + 배포
- [ ] §6.5 Backend CORS 갱신
- [ ] §7 E2E 검증 스크립트 통과
- [ ] §8 (선택) 도메인 연결
- [ ] §11 Sentry/백업/Cloudflare (출시 후 1주차)

---

## 14. 사용자 액션 요약 (🛑) — 단 3건

문서 최상단 `🛑 사용자가 해야 할 일`과 동일:

1. **토큰 3종 발급** (GitHub PAT + Railway API Token + Vercel Token)
2. **Cloudflare R2 API 토큰** 발급 (Access Key + Secret + Endpoint)
3. **Google OAuth 클라이언트 ID** 발급 (Google Cloud Console, client secret 불필요)

위 3건만 끝나면 Claude Code가 §0~§13 끝까지 자동 진행.
도메인 연결(§8)은 선택 사항.

---

## 15. 부록 — 백엔드 환경변수 전체 목록 (Railway 기준)

| 키 | 값 | 출처 |
|---|---|---|
| `APP_ENV` | `prod` | 고정 |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Railway 자동 (또는 Supabase) |
| `SECRET_KEY` | `openssl rand -hex 32` | 1회 생성 |
| `ALGORITHM` | `HS256` | 고정 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | 권장 |
| `CORS_ORIGINS` | `["https://*.vercel.app", "https://app.surplushub.kr"]` | 배포 후 갱신 |
| `AI_PROVIDER` | `vertex` | 기존 .env와 동일 |
| `GOOGLE_CLOUD_PROJECT` | `est-alan-451902` | 기존 |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | 기존 |
| `GCP_SA_JSON` | service-account.json 내용 | 로컬 파일 → secret |
| `AWS_ACCESS_KEY_ID` | R2 토큰 | §3.4 |
| `AWS_SECRET_ACCESS_KEY` | R2 토큰 | §3.4 |
| `AWS_S3_BUCKET_NAME` | `surplus-hub-uploads` | 고정 |
| `AWS_S3_REGION` | `auto` | R2는 auto |
| `AWS_S3_ENDPOINT_URL` | `https://<acct>.r2.cloudflarestorage.com` | §3.4 |
| `MAX_UPLOAD_SIZE_MB` | `10` | 권장 |
| `GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` | §C (Google Cloud Console) |
| `FRONTEND_URL` | `https://<project>.vercel.app` | §6.2 후 설정 (비밀번호 재설정 링크) |
| `SMTP_HOST` 등 | (선택) SMTP_PORT/USER/PASSWORD, EMAILS_FROM_EMAIL | §C-4, 미설정 시 메일만 미발송 |
| `WEB_CONCURRENCY` | `2` | gunicorn workers |
| `API_V1_STR` | `/api/v1` | 기본값과 동일 (생략 가능) |

프론트엔드 환경변수 (Vercel):

| 키 | 값 |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `xxxx.apps.googleusercontent.com` (백엔드 `GOOGLE_CLIENT_ID`와 동일 값) |
| `NEXT_PUBLIC_API_URL` | `https://<railway>.up.railway.app` (또는 도메인) |
| `NEXT_PUBLIC_CDN_URL` | `https://cdn.surplushub.kr` (도메인 연결 후, 선택) |
