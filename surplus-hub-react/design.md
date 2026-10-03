# Design — 자투리 (Surplus Hub)

잠금된 디자인 시스템. **모든 프론트 작업(웹/모바일)은 이 파일을 먼저 읽고 따른다.**
페이지마다 새 테마를 고르지 않는다 — 일관성이 규칙이다. 시스템을 바꿔야 하면 이 파일을 먼저 수정한다.
(2026-07-21 홈 리디자인 기준으로 잠금. 구현 정본: `apps/web/src/app/globals.css` + `apps/web/tailwind.config.js`)

## System
- Genre · **editorial** (에디토리얼 마켓플레이스 — 신문 분류광고의 밀도와 정직함)
- Macrostructure · 앱 피드 = **Catalogue index-rail** (모바일: 마스트헤드+칩 레일+리스트 / 데스크톱: 좌측 인덱스 레일+피드)
- Theme · 1a 브랜드 시스템 (웜 페이퍼 · 쿨 잉크 · 오렌지 단일 악센트)
- Axes · light-paper / sans(Pretendard) / warm-orange

## Tokens (정본 = globals.css `:root` · Tailwind 값은 이를 미러링)
```css
:root {
  /* 표면 */
  --paper:   #f9f7f6;   /* 앱 배경 */
  --surface: #FFFFFF;   /* 카드/시트 */
  --field:   #f1f0ee;   /* 입력·썸네일 배경 */
  /* 잉크 */
  --ink:   #151c28;     /* 제목·가격 */
  --ink-2: #6a7181;     /* 메타·서브 (AA 통과 — 작은 글자는 이걸로) */
  --ink-3: #8C8275;     /* placeholder 전용. 12px대 본문에 쓰지 말 것(AA 미달) */
  /* 라인 */
  --line:   #e2e4e9;    /* 표준 보더 */
  --line-2: #EBE3D8;    /* 리스트 헤어라인 구분선 */
  /* 악센트 — 화면당 ≤5%, 주요 액션에만 */
  --accent:      #ed701d;  --accent-dark: #e65c00;  /* :active */
  --accent-soft: #fdf0e7;  --accent-text: #a54a0d;  /* soft 배경 위 텍스트 */
  /* 시맨틱 */
  --olive-tx:#3F5A29; --olive-bg:#EFF3E6; --olive-bd:#D2DCBE;  /* 등급 "상" */
  --destructive:#C0492B;  --warning:#B8761F;
  /* 형태 */
  --radius-chip:6px; --radius-field:12px; --radius-thumb:14px; --radius-btn:16px;
}
```
Tailwind 클래스명: `bg-paper/surface/field` · `text-ink/ink-2` · `border-line` · `bg-primary`(=accent) · `bg-accent`(=soft) · `rounded-chip/field/thumb/btn`. **임의 hex/rgb 인라인 금지 — 토큰 클래스만.**

## Typography (Pretendard 단일 서체 · 숫자는 항상 `tabular`)
| 역할 | 스펙 |
|---|---|
| 마스트헤드 h1 | 21 / 800 / -0.5px |
| 화면 타이틀 | 19 / 700 / -0.4px |
| 카드 제목 | 17 / 600 / lh 1.32 / -0.3px · line-clamp-2 |
| **피드 가격** | **20 / 700 / -0.5px · tabular — 행의 시선 종착점.** "원"은 13/500 ink-2로 죽인다 |
| 본문·스펙 | 13.5 / 500 / ink-2 |
| 메타(위치·날짜·판매자) | 12.5 / 500 / ink-2 |
| 칩 라벨 | 12 / 600 |

이탤릭 헤딩 금지. 강조는 굵기·악센트 색으로.

## 컴포넌트 보이스
- **피드 행**: 썸네일(100×100, rounded-thumb, border line-2) + 정보 컬럼. 구분선은 정보 컬럼의 `border-b border-line-2` — **썸네일 아래로 지나가지 않는 들여쓴 헤어라인**. 피드에 그림자·카드박스 금지.
- **상태**: 판매완료 = 썸네일 오버레이(`bg-ink/70` + 흰 12/700) + 제목·가격 톤다운. 예약중 = 중립 칩(field 배경 + ink-2). 등급 "상" = 올리브 칩, "중/하" = 무채 아웃라인 칩. **데이터 없으면 렌더하지 않는다.**
- **무료나눔**: ink/700 — 악센트 아님.
- **칩(필터)**: rounded-xl, 활성 = accent-soft 배경 + accent 보더 + accent-text. "전체" 칩으로 해제 가능해야 함.
- **리스트 헤더**: `border-b-2 border-ink` 룰 + 좌측 실데이터 카운트("전체 N건" — API 값 있을 때만) + 우측 보더리스 정렬 select.
- **버튼**: Primary = `bg-primary text-primary-foreground rounded-btn` + `active:bg-primary-dark`, 화면당 하나. Secondary = 아웃라인(`border-line bg-surface`) + `hover:bg-field`. 터치 타깃 ≥44px.
- **모든 인터랙티브 요소**: `focus-visible:ring-2 ring-primary` 즉시 표시(트랜지션 금지) + `:active` 상태 + disabled 3채널(opacity+cursor+attr).

## Motion stance
- motion-cut: 라이브러리 없음. `transition-colors`만 기본. transform/opacity 외 속성 애니메이션 금지.
- `prefers-reduced-motion: reduce` → 애니메이션 제거 (globals.css에 적용됨).
- 그라데이션 전면 금지 (배경·버튼·FAB 모두 단색).

## 정직성 규칙
- 지어낸 숫자·지표·후기 금지. 카운트/좋아요/등급/판매자명은 API가 줄 때만 조건부 렌더. 좋아요 0은 숨긴다.
- 기존 카피 임의 변경 금지.

## 알려진 플래그
- `#ed701d` 위 흰 텍스트 ≈ 2.8:1 — 14px bold 기준 AA 미달(브랜드 전반 이슈). 악센트를 어둡게 할지는 오너 결정 사항. 새 컴포넌트에서 흰 글자-오렌지 조합을 12px 이하로 쓰지 말 것.
- `docs/DESIGN_SYSTEM.md`(v3)의 컬러 값(테라코타)은 구버전 — **토큰은 이 파일과 globals.css가 현행.** 컴포넌트 상세 스펙(§5)은 여전히 유효.

## Exports
정본은 이 프로젝트의 `globals.css`. Tailwind v4 `@theme` / DTCG `tokens.json` / shadcn 변수 포맷이 필요하면 "design.md에 Tailwind exports 추가해줘"라고 요청.
