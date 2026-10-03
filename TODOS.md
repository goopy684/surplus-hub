# TODOS

## Phase 1 MVP (당근마켓 for B2B) — 구현 시 필수 확인

### ~~BUG: MaterialStatus enum 불일치~~ ✅ DONE
- **해결:** 백엔드에 RESERVED 상태 추가 완료 (2026-03-26). 프론트엔드는 재설계 시 통일 예정.

### ~~CHECK: AI 임베딩 자동 생성 훅~~ ✅ NOT AN ISSUE
- **확인 결과:** embedding_hook.py가 이미 try/except로 감싸져 있고 background task로 실행. AI 서비스 미연결 시에도 자재 등록은 성공함.

## Phase 1 — 남은 작업

### ~~TODO: 프론트엔드 당근마켓 UX 재설계~~ ✅ MOSTLY DONE (2026-05-16)
- **적용 위치:** `surplus-hub-react/apps/web` (신규 monorepo)
- **완료:**
  - 홈 피드 2열 그리드 (md:3-col / lg:4-col) + 빈 상태 ("아직 등록된 자재가 없어요" + 등록하기 버튼)
  - BottomNav 5탭 (홈 / 검색 / 등록 FAB / 채팅 / 프로필) — 기존 구현 확인
  - 채팅 리스트 빈 상태 — 기존 구현 확인
  - 카테고리 emoji/label 일관성 — home, register, material-edit 동일
- **남은 갭:**
  - 채팅방 상단 자재 미니 카드 미구현 → `@repo/core`에 `useChatRoomDetail({materialId})` 같은 훅 추가 필요. 별도 PR로 분리 권장.

### ~~TODO: 카테고리 시드 데이터 업종별 재구성~~ ✅ DONE (2026-05-16)
- **What:** 백엔드 `crud_category.seed_categories()` 6항목으로 재구성 — 조명/문창호/건축자재/전기/설비/기타
- **변경 파일:**
  - `surplus-hub-api-v3/app/crud/crud_category.py`
  - `surplus-hub-api-v3/app/tests/api/test_categories.py`
- **주의:** 기존 DB에 시드된 카테고리는 `seed_categories()`가 idempotent하게 동작(존재 시 skip)하므로, **운영 DB는 수동 마이그레이션 필요** (구 카테고리 비활성화 + 신규 6개 insert).
