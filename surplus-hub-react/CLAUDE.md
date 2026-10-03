# surplus-hub-react

Turbo 모노레포 — `apps/web`(Next.js 14, port 4000) · `apps/mobile`(Expo) · `packages/core`(API 훅/타입) · `packages/ui`.

## 디자인 시스템 (필수)

**UI/프론트 작업 전에 루트 `design.md`를 반드시 읽고 따른다.** 잠금된 시스템이며 페이지별로 새 테마·색·폰트를 고르지 않는다.

- 색·폰트는 토큰 클래스만 사용 (`bg-paper` `text-ink` `bg-primary` `rounded-thumb` 등). 임의 hex/rgb 인라인 금지.
- 토큰 정본은 `apps/web/src/app/globals.css` `:root` — `tailwind.config.js`는 이를 미러링. 값을 바꿀 땐 두 파일을 함께.
- 컴포넌트 상세 스펙은 `docs/DESIGN_SYSTEM.md` §2~§9 (단, 그 문서의 컬러 값은 구버전 — 색은 design.md 기준).
- 시스템을 바꿔야 하면 `design.md`를 먼저 수정한 뒤 코드에 반영한다.

## 검증

- 웹: `apps/web`에서 `npm run lint` · `npm run check-types` · `npx jest` (chat/community 등 일부 스위트는 AuthProvider 이슈로 기존부터 실패 — home 등 나머지가 깨지지 않으면 OK)
- 로컬 실행: 백엔드 `~/dev/owner/surplus-hub-api-v3` (uvicorn :8000, DB는 `docker-compose up -d db` → :5433), 프론트 `npm run dev` (:4000)
