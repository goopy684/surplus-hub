# TextField
폼 입력. 라벨은 위, 52px, 1.5px 보더.

- 라벨 14/700. AI가 채운 필드는 라벨 옆 `AI` 소프트 필(`bg-accent text-accent-foreground` 11/700).
- 입력: `min-h-[52px] rounded-field border-[1.5px] border-line bg-surface px-3.5 text-[15.5px]`.
- 포커스: `border-primary ring-2 ring-primary/20`. 가격 입력 숫자는 `num`, 단위 "원"은 우측 `ink-2`.
- 선택형(카테고리·거래방식)은 `aria-pressed` 버튼 그룹, 선택 = `bg-primary` 필.
- 모바일: `packages/ui/src/MaterialInput.tsx`.
