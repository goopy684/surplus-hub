# TODOS

## Phase 1 MVP (당근마켓 for B2B) — 구현 시 필수 확인

### ~~BUG: MaterialStatus enum 불일치~~ ✅ DONE
- **해결:** 백엔드에 RESERVED 상태 추가 완료 (2026-03-26). 프론트엔드는 재설계 시 통일 예정.

### ~~CHECK: AI 임베딩 자동 생성 훅~~ ✅ NOT AN ISSUE
- **확인 결과:** embedding_hook.py가 이미 try/except로 감싸져 있고 background task로 실행. AI 서비스 미연결 시에도 자재 등록은 성공함.

## Phase 1 — 남은 작업

### ~~TODO: 프론트엔드 당근마켓 UX 재설계~~ ✅ DONE (2026-10-23)
- **적용 위치:** `surplus-hub-react/apps/web` 및 `surplus-hub-react/apps/mobile`
- **완료:**
  - 홈 피드 2열 그리드 (md:3-col / lg:4-col) + 빈 상태 ("아직 등록된 자재가 없어요" + 등록하기 버튼)
  - BottomNav 5탭 (홈 / 검색 / 등록 FAB / 채팅 / 프로필) — 모바일 소형 뷰포트(360px) 말줄임 방어 및 플로팅 액션바 오프셋(bottom-20) 적용
  - 채팅 리스트 빈 상태 — 기존 구현 확인
  - 카테고리 emoji/label 일관성 — home, register, material-edit 동일
  - 채팅방 상단 자재 미니 카드 구현 완료 (`GET /api/v1/chats/rooms/{room_id}`, `@repo/core` `useChatRoomDetail`, 웹·모바일 채팅방 상단 카드 및 삭제된 자재 폴백 표시)
  - 모바일 커뮤니티 게시글 상세 화면(`apps/mobile/app/community/[id].tsx`) 및 댓글 푸시 딥링크(`/community/{id}`) 구현 완료

### ~~TODO: 카테고리 시드 데이터 업종별 재구성~~ ✅ DONE (2026-05-16)
- **What:** 백엔드 `crud_category.seed_categories()` 6항목으로 재구성 — 조명/문창호/건축자재/전기/설비/기타
- **변경 파일:**
  - `surplus-hub-api-v3/app/crud/crud_category.py`
  - `surplus-hub-api-v3/app/tests/api/test_categories.py`
- **주의:** 기존 DB에 시드된 카테고리는 `seed_categories()`가 idempotent하게 동작(존재 시 skip)하므로, **운영 DB는 수동 마이그레이션 필요** (구 카테고리 비활성화 + 신규 6개 insert).

### ~~TODO: 모바일 실기기 푸시 설정 및 EAS 빌드 (P1)~~ ✅ DONE (2026-10-24)
- **Firebase Android 앱 연동**: GCP `surplus-502901` 프로젝트에 Firebase 활성화 및 `com.surplushub.mobile` 등록 완료 (App ID: `1:131608276147:android:4d2c099cb1c90a62eb14c6`).
- **Google Services & FCM V1 키 주입**:
  - `google-services.json` 다운로드 및 `.gitignore` 등록, EAS file secret `GOOGLE_SERVICES_JSON`으로 등록 완료.
  - `apps/mobile/app.config.js`에 `process.env.GOOGLE_SERVICES_JSON` 및 `./google-services.json` 동적 fallback 연동 완료.
  - `firebase-adminsdk-fbsvc@surplus-502901.iam.gserviceaccount.com` 키를 EAS Android FCM V1 Service Account Key(ID: `d19c5460-2d1e-47a4-98eb-e0e2000d3ba7`)로 등록 완료.
- **EAS Android Preview (APK) 빌드**:
  - `apps/mobile/eas.json`에 `preview` 프로파일의 `environment: preview` 및 `buildType: apk` 설정.
  - Build ID: `907a3aef-6844-4f52-be52-f83bf6b6e122` (대시보드: https://expo.dev/accounts/seongchae/projects/surplus-hub-mobile/builds/907a3aef-6844-4f52-be52-f83bf6b6e122).

### ~~TODO: 넥스트 기능 보완 (N1·N2·N3)~~ ✅ DONE (2026-10-24)
- **N1 커뮤니티 카테고리 크로스플랫폼 동기화 & 모바일 글쓰기**:
  - 백엔드 `crud_community.py` 카테고리 양방향 별칭 및 정규화 매핑 지원.
  - 웹 `community/write` 및 모바일 `(tabs)/community` 카테고리 통일 (`QnA`, `노하우`, `안전`, `정보`).
  - 모바일 글쓰기 화면(`apps/mobile/app/community/write.tsx`) 및 `(tabs)/community` 진입 버튼 구현.
- **N2 신고 모달(ReportModal) UI 연결**:
  - 공통 신고 모달(`ReportModal.tsx`) 신설 및 자재 상세(`material/[id]`), 커뮤니티 상세(`community/[id]`) 상단 액션바 연동 (`createReport` API 연결).
- **N3 B2B 이벤트 자동 시드**:
  - 백엔드 `crud_event.seed_events()` 및 스타트업 훅 연동으로 산단 특화 3대 프로모션 자동 시드 및 운영 노출 완료.

### ~~TODO: B2B 사업자등록번호 인증 및 운영 점검 (P1-5·P3-3)~~ ✅ DONE (2026-10-24)
- **P1-5 운영 DB 푸시 설정 마이그레이션 검증**:
  - Railway 운영 API `GET /api/v1/notifications/preferences` 호출 검증 완료 (`push_prefs_001` 5개 컬럼 정상 응답 확인).
- **P3-3 B2B 사업자등록번호 진위·유효성 검증 및 '사업자 인증' 배지 시스템**:
  - 백엔드 `POST /api/v1/users/me/verify-business`: 국세청 표준 10자리 사업자등록번호 체크섬 검증(`validate_korean_business_number`) 및 인증 시 `trustLevel = 85`, 매너온도 `+1.5°C` 승격, `Seller.trust_level` 스키마 노출.
  - 웹·모바일 UI: `@repo/core` `verifyBusiness` / `useVerifyBusiness` 훅 추가, 프로필 수정(`/profile/edit`) 및 모바일 프로필 화면 사업자 인증 카드 탑재, 자재 상세(`material/[id]`) 판매자명 우측 **`사업자 인증`** 배지 노출.
  - 모바일 신뢰도 등급 버그 수정: 신규 가입 기본값(`trust_level = 1`)에서 `"관리 필요"`로 오표기되던 레이블을 `"일반 회원"` / `"우수 회원"` / `"사업자 인증 완료"`로 정상화.
  - 운영 DB 4대 B2B 판매처 계정(`(주)반월철강자재`, `온수산단전설`, `시화배관자재`, `성수인테리어하우징`) 사업자 인증 적용 완료.

### ~~TODO: 잔여 기술 부채 및 웹·모바일 UX 정합성 마무리 (P4)~~ ✅ DONE (2026-10-24)
- **거래 내역 리뷰 완료(`hasReviewed`) 서버 동기화**:
  - 백엔드 `GET /api/v1/transactions/` 및 `GET /api/v1/transactions/{id}` 응답에 `Review` 테이블 조회 기반 `hasReviewed: bool` 반환.
  - `@repo/core` `Transaction` 타입 및 웹 구매 내역(`/profile/purchases`) 연동으로 새로고침 후에도 **`리뷰 완료`** 배지 유지(409 에러 방지).
- **401 토큰 만료 시 Refresh Token 자동 재발급 인터셉터 (`@repo/core`)**:
  - `packages/core/src/api/client.ts`에 싱글 플라이트(`refreshPromise`) 기반 `/api/v1/auth/refresh` 호출 및 원 요청 1회 자동 재시도 응답 인터셉터 구현.
- **자재 상세 위치 지도 연동 & 모바일 자재 상세 `사업자 인증` 배지 동기화**:
  - 웹(`apps/web/src/app/material/[id]/page.tsx`) 및 모바일(`apps/mobile/app/material/[id].tsx`) 자재 상세 위치 행에 카카오맵 **`지도 보기`** 바로가기 연결 및 모바일 판매자 프로필 **`사업자 인증`** 배지 반영.

### ~~TODO: 거래 후기 동선 완성·운영 시드 및 잔여 기술 부채 전수 해결 (P5)~~ ✅ DONE (2026-10-24)
- **좋아요 동시성 `IntegrityError` 방어 (`crud_like.py`)**:
  - `CRUDMaterialLike.toggle` 및 `CRUDPostLike.toggle`에서 동시 더블클릭 시 발생할 수 있는 `IntegrityError`를 롤백 후 현재 상태로 안전하게 반환하도록 방어.
- **채팅방 AI 스마트 답장(`loadSmartReplies`) 비동기 언마운트 가드 (`chat/[id]/page.tsx`)**:
  - `cancelled` 플래그 및 `useEffect` 의존성 정규화로 언마운트 후 상태 업데이트 경고(`act(...)`) 및 ESLint 기술 부채 제거.
- **판매자 및 내 거래 후기(`reviews`) 조회 동선 연결 + 운영 DB B2B 거래 후기 시드**:
  - 마이페이지(`/profile`)에 `받은 거래 후기` 메뉴 연결, `/profile/reviews?userId=...` 공개 판매자 후기 조회 지원, 자재 상세(`material/[id]`) 판매자 영역에 `거래 후기 보기` 링크 연결 및 운영 DB 4대 판매처 실거래 후기 시드 완료.
