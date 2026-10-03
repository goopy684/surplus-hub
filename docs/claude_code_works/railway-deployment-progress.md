# Railway 배포 작업 진행 내역

- 날짜: 2026-03-13
- 프로젝트: Surplus Hub (백엔드: surplus-hub-api-v3, 프론트: surplus-hub-react)
- 참조 문서: `/Users/jeongseongchae/dev/owner/RAILWAY_DEPLOYMENT_GUIDE.md`

---

## 진행 상태

| Step | 작업 내용 | 상태 |
|------|----------|------|
| 1 | 사전 준비 (GitHub 푸시 + Railway 가입/연동) | 완료 |
| 2 | DB 생성 (Railway PostgreSQL 프로비저닝) | 미완료 |
| 3 | 백엔드 배포 (surplus-hub-api-v3) | 미완료 |
| 4 | 프론트엔드 배포 (surplus-hub-react) | 미완료 |
| 5 | 최종 검증 (Clerk 도메인 등록, 로그 확인) | 미완료 |

---

## 상세 기록

### Step 1: 사전 준비 - 완료
- GitHub에 백엔드/프론트엔드 코드 푸시 완료
- Railway 회원가입 및 GitHub 계정 연동 완료

### Step 2: DB 생성 - 다음 작업
- Railway Dashboard → New Project → Provision PostgreSQL
- Connect 탭에서 DATABASE_URL 확인 필요

### Step 3: 백엔드 배포 - 대기
- GitHub Repo 연결 → surplus-hub-api-v3
- 환경변수: DATABASE_URL, PORT=8000, 기타 .env 항목
- Networking → Generate Domain으로 Public URL 생성
- 필요시 alembic upgrade head 실행

### Step 4: 프론트엔드 배포 - 대기
- GitHub Repo 연결 → surplus-hub-react
- Root Directory: / (루트)
- Build Command: npx turbo run build --filter=web
- Start Command: npm run start --workspace=web
- 환경변수: NEXT_PUBLIC_API_URL, CLERK 키들
- Networking → Generate Domain

### Step 5: 최종 검증 - 대기
- Clerk Allowed Origins에 프론트 도메인 등록
- Deployments → View Logs로 에러 확인
