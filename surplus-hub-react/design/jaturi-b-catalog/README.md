# 자투리 B 카탈로그

건설 잉여자재 중고거래 마켓플레이스 **자투리(Surplus Hub)**의 디자인 시스템. 매물 사진이 먼저 보이는 밝은 카탈로그로, 화이트 그라운드와 쿨 잉크에 코발트 악센트 하나를 쓴다.

코드 정본은 `goopy684/surplus-hub-react`의 `apps/web/src/app/globals.css`(`:root`)이며 `apps/web/tailwind.config.js`·`apps/mobile/tailwind.config.js`가 미러링한다. 레포 문서: `design.md`(토큰), `docs/DESIGN_SYSTEM.md` v4(컴포넌트·화면 패턴). 이 시스템과 레포가 다르면 레포가 맞다.

## 원칙

1. **매물이 주인공.** 사진·제목·가격이 먼저, 크롬은 뒤로. 면은 `paper`/`field`로 나누고 선은 `line-2` 1px만.
2. **악센트는 하나, 행동에만.** `primary`는 주요 액션 버튼·FAB·링크·무료나눔·내 채팅 버블·포커스 링. 필터 칩의 *선택*은 코발트가 아니라 `ink` 채움.
3. **가독성 우선.** 주 사용자는 50대 현장 종사자, 야외. 텍스트 대비 4.5:1 이상, 가격·제목은 굵게.
4. **데이터 없으면 그리지 않는다.** 등급·좋아요·카운트·판매자명은 값이 있을 때만. 지어낸 숫자 금지.
5. **둥글되 장식 없이.** 필 칩, 16px 카드, 원형 아이콘 버튼. 그림자·그라데이션·이모지 없음(FAB 그림자만 예외).

## 색

| 역할 | 토큰 | 규칙 |
|---|---|---|
| 배경 | `paper` / `canvas` | 홈·상세·폼은 `paper`, 카드를 띄우는 화면(커뮤니티·MY)은 `canvas` |
| 면 | `surface`, `field` | 카드·시트는 `surface`, 검색 필·placeholder·보조 버튼은 `field` |
| 텍스트 | `ink` > `ink-2` > `ink-3` | `ink-3`(3.1:1)은 placeholder 전용 |
| 선 | `line`, `line-2` | 칩·입력은 `line`, 구분선·카드는 `line-2` |
| 악센트 | `primary` (+`primary-dark`), `accent-soft` + `accent-text` | 흰 글자 on `primary` 8.0:1 |
| 등급 상 | `olive-tx` / `olive-bg` / `olive-bd` | 그린 필(4.7:1). 중·하는 `line` 아웃라인 + `ink-2` |
| 상태 | `destructive`, `warning` | 텍스트로만, 배경 도배 금지 |

hex 인라인 금지 — 웹은 Tailwind 토큰 클래스(`bg-paper` `bg-canvas` `text-ink` `bg-primary` `border-line-2`), 모바일은 NativeWind 같은 이름. React Native에서 prop 색이 필요할 때만 토큰 값을 그대로 쓴다.

## 타이포그래피

- 본문 **Gothic A1**(400–800), 숫자 **Space Grotesk**(500–700, `num` 클래스, tabular). 둘 다 Google Fonts.
- 화면 타이틀 22/800/-0.6, 서브 헤더 17/800, 그리드 카드 제목 14/600 2줄, 가격 `num` 17/700 + "원" 13/600(같은 ink).
- 이탤릭 금지. 강조는 굵기와 `primary`.

## 형태 · 간격

- 모바일 좌우 패딩 `space-5`(20). 그리드 gap 가로 `space-3` · 세로 `space-6`.
- 반경: 칩·검색·배지·FAB `radius-chip`(필), 카드·버블 `radius-card` 16, 버튼·입력 14, 상세 시트 상단 20.
- 터치 타깃 `touch-min` 44 이상. 칩 38, 검색 48, 입력·CTA 52.
- 그림자: `shadow-fab`(FAB), `shadow-card`(사진 위 원형 버튼)만.

## 아이콘

모노라인 SVG, 24 viewBox, stroke 1.8(활성 2.2), `currentColor`. 이모지·컬러 아이콘 금지. 하단 탭 활성 = `ink` + 굵은 라벨.

## 화면 패턴

| 패턴 | 배경 | 구성 |
|---|---|---|
| 카탈로그 피드 | paper | 위치 헤더 → 검색 필 → 필터 칩 → 2열(웹 3열) 그리드 → FAB |
| 상세 | surface | 340px 사진 + 원형 버튼 → 위로 겹치는 시트(20) → 고정 하단바(관심 · 가격 · Primary) |
| 카드 피드 | canvas | 흰 헤더(타이틀+칩) → `surface` 카드 리스트 → FAB |
| 대시보드 | canvas | 프로필 카드 → 4칸 통계 → 메뉴 리스트 카드 |
| 행 리스트 | paper | 뒤로가기 헤더 → `line-2` 구분 행 |
| 폼 | paper | 사진 → AI 안내(`accent-soft`) → 52px 입력들 → 하단 Primary |
| 인증 | paper | 중앙 max 384, 모바일 무보더 / 데스크톱 `line-2` 카드 |

## 보이스

한국어, 간결·정중·현장 친화. 단위 `원`, `개`·`장`·`톤`, `km`, `℃`; 규격 `50×50`. 상태 판매중 / 예약중 / 거래완료. 무료는 `무료나눔`. 기존 카피는 임의로 바꾸지 않는다.

## 접근성

진짜 요소(`button type="button"`, `a href`, `label`+`input`), 아이콘 버튼 `aria-label`, 토글 `aria-pressed`, 현재 탭 `aria-current`. 모든 인터랙티브에 즉시 보이는 `focus-visible` 링(`primary`) + `:active` + disabled 3채널. 색만으로 정보 전달 금지.

## 하지 말 것

- 두 번째 악센트, 필터 선택을 코발트로 칠하기
- 그라데이션, 좌측 컬러 보더 카드, 카드 그림자
- 이모지 아이콘, `gray-*`/`white`/`black` 기본 팔레트, 임의 hex
- Pretendard·Inter 등 다른 폰트, 이탤릭
- 가짜 상태바, 44px 미만 타깃, `div onClick`

## 컴포넌트

카드는 레포 구현을 그대로 옮긴 **정적 렌디션**이다(번들 없음). 실제 구현은 웹 페이지 코드와 `packages/ui`(RN: Button, ChatBubble, ChatListItem, MaterialInput).

## 동기화 메모

- 2026-10-05 `design/b-catalog@5237c6a` 기준. 다크 테마는 앱에 없어 Light 하나만.
- 폰트 파일은 Google Fonts 호스팅이라 `fonts/`에 넣지 않음. 모바일 앱은 아직 시스템 폰트.
- 로고 자산 없음 — 앱은 큐브 아이콘 + "자투리" 워드마크를 코드로 그린다.
