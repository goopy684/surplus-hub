# Button
Primary·Secondary·아이콘 버튼. 화면당 Primary는 하나.

- **Primary**: `bg-primary text-primary-foreground rounded-btn font-bold min-h-[48px]` (하단 CTA 52–56), `hover/active:bg-primary-dark`, `focus-visible:ring-2 ring-ring ring-offset-2`.
- **Secondary**: `bg-field` 또는 `border border-line bg-surface`, `hover:bg-field`.
- **아이콘 버튼**: 44px 원형, `aria-label` 필수.
- **FAB**: `rounded-full bg-primary shadow-fab h-[52px] px-5` + 아이콘 + 라벨, 하단 탭 위 88px.
- disabled: `disabled:opacity-50 disabled:cursor-not-allowed` + `disabled` 속성.

구현: 웹은 페이지별 Tailwind 클래스, 모바일은 `packages/ui/src/button.tsx`.
