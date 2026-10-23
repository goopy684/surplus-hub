# Design — 자투리 (Surplus Hub)

잠금된 디자인 시스템. **모든 프론트 작업(웹/모바일)은 이 파일을 먼저 읽고 따른다.**
페이지마다 새 테마를 고르지 않는다 — 일관성이 규칙이다. 시스템을 바꿔야 하면 이 파일을 먼저 수정한다.
(2026-10-05 **B · 밝은 카탈로그**로 교체. 이전 1a 에디토리얼 시스템은 git 이력 참고. 구현 정본: `apps/web/src/app/globals.css` + `apps/web/tailwind.config.js`)

## System
- Genre · **catalogue** (사진 중심 마켓플레이스 — 매물이 먼저 보이고, 크롬은 뒤로 물러선다)
- Macrostructure · 앱 피드 = **2열 사진 그리드** (모바일: 위치+검색 필+칩 레일+그리드 / 데스크톱: 좌측 지역 레일+3열 그리드)
- Theme · 화이트 그라운드 · 쿨 잉크 · 코발트 단일 악센트
- Axes · light-white / sans(Gothic A1) + numerals(Space Grotesk) / cobalt

## Tokens (정본 = globals.css `:root` · Tailwind 값은 이를 미러링)
```css
:root {
  /* 표면 */
  --paper:   #FFFFFF;   /* 앱 배경 */
  --canvas:  #F5F6F9;   /* 카드를 띄우는 회색 바탕 (커뮤니티·MY) */
  --surface: #FFFFFF;   /* 카드/시트 */
  --field:   #F2F4F8;   /* 입력·검색 필·칩 배경 */
  /* 잉크 */
  --ink:   #121620;     /* 제목·가격·활성 칩 */
  --ink-2: #5A6273;     /* 메타·서브 (AA 통과) */
  --ink-3: #8A92A3;     /* placeholder 전용 */
  /* 라인 */
  --line:   #DDE1E8;    /* 아웃라인 칩·입력 보더 */
  --line-2: #EBEEF3;    /* 구분선 */
  /* 악센트 — 주요 액션·선택 상태에만 */
  --accent:      #1E3FCC;  --accent-dark: #16309E;  /* :active */
  --accent-soft: #E8EDFB;  --accent-text: #16309E;  /* soft 배경 위 텍스트 */
  /* 시맨틱 */
  --olive-tx:#1F7A4D; --olive-bg:#E7F4EC; --olive-bd:#BFE0CC;  /* 등급 "상" (토큰명 호환 유지) */
  --destructive:#C2362B;  --warning:#A8650F;
  /* 형태 */
  --radius-chip:9999px; --radius-field:14px; --radius-thumb:16px; --radius-btn:14px; --radius-card:16px;
}
```
Tailwind 클래스명: `bg-paper/canvas/surface/field` · `text-ink/ink-2` · `border-line` · `bg-primary`(=accent) · `bg-accent`(=soft) · `rounded-chip/field/thumb/btn/card` · `font-num`. **임의 hex/rgb 인라인 금지 — 토큰 클래스만.**

## Typography (Gothic A1 본문 · 숫자는 Space Grotesk `num`)
| 역할 | 스펙 |
|---|---|
| 위치 헤더(홈) | 20 / 800 / -0.6px |
| 화면 타이틀 | 22 / 800 / -0.6px |
| 상세 제목 | 22 / 800 / lh 1.3 |
| 그리드 카드 제목 | 14 / 600 / lh 1.35 · line-clamp-2 |
| **가격** | **`num` 17(그리드)·20(상세 바) / 700.** "원"은 Gothic A1 13/600 |
| 본문 | 14–15 / 400–500 / lh 1.55–1.65 |
| 메타(위치·날짜) | 12–12.5 / 500 / ink-2 |
| 칩 라벨 | 14 / 500(비활성)·700(활성) |

## 컴포넌트 보이스
- **피드 카드**: 정사각 썸네일(`rounded-thumb`, field 배경) + 아래 제목·가격·메타 3줄. 그림자·보더 없음. 사진 없으면 field 배경 + 아이콘.
- **상태**: 판매완료 = 썸네일 `bg-ink/60` 오버레이 + 흰 12/700 + 제목·가격 톤다운. 예약중 = 썸네일 좌상단 흰 필 배지. 등급 "상" = 그린 필, "중/하" = 아웃라인 필. **데이터 없으면 렌더하지 않는다.**
- **무료나눔**: primary 800.
- **칩(필터)**: 높이 38 · `rounded-chip`. 활성 = `bg-ink text-white`, 비활성 = `border-line bg-surface`. "전체" 칩으로 해제 가능해야 함.
- **검색 필**: 높이 48 · `rounded-chip` · `bg-field` · 보더 없음.
- **카드(커뮤니티·MY)**: `bg-surface rounded-card` on `bg-canvas`, 보더·그림자 없음.
- **버튼**: Primary = `bg-primary text-primary-foreground rounded-btn` + `active:bg-primary-dark`, 화면당 하나. FAB = `rounded-full shadow-fab`. Secondary = `bg-field` 또는 아웃라인(`border-line`). 터치 타깃 ≥44px.
- **하단 탭**: 활성 = ink + 굵게(악센트 아님), 비활성 = ink-2.
- **모든 인터랙티브 요소**: `focus-visible:ring-2 ring-primary` 즉시 표시 + `:active` 상태 + disabled 3채널(opacity+cursor+attr).

## Motion stance
- 라이브러리 없음. `transition-colors`만 기본. transform/opacity 외 속성 애니메이션 금지.
- `prefers-reduced-motion: reduce` → 애니메이션 제거 (globals.css에 적용됨).
- 그라데이션 금지 (배경·버튼·FAB·게이지 모두 단색).

## 정직성 규칙
- 지어낸 숫자·지표·후기 금지. 카운트/좋아요/등급/판매자명은 API가 줄 때만 조건부 렌더. 좋아요 0은 숨긴다.
- 기존 카피 임의 변경 금지.

## 알려진 플래그
- 이전 1a 오렌지(#ed701d) 위 흰 텍스트 대비 미달 이슈는 코발트(#1E3FCC, 흰 글자 ≈7.5:1)로 교체되며 해소.
- `apps/mobile`(NativeWind)은 B 토큰·컬러로 동기화됨. 폰트는 아직 시스템 폰트 — Gothic A1/Space Grotesk는 `@expo-google-fonts` 추가 후 적용 예정.
- `docs/DESIGN_SYSTEM.md`(v3) 컬러 값은 구버전.
- 디자인 시안: Claude Design 캔버스 "자투리 리디자인 방향" B행.
