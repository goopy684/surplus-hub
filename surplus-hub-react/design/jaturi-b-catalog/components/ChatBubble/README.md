# ChatBubble
채팅방 말풍선과 입력바.

- 내 메시지: `bg-primary text-primary-foreground rounded-card rounded-br-md`, 시간 `text-primary-foreground/75`.
- 상대 메시지: `bg-field text-ink rounded-card rounded-bl-md`, 시간 `ink-2`.
- 최대 폭 70–80%.
- 입력바: `h-11 rounded-chip bg-field` 입력 + 44px 원형 `bg-primary` 전송(`aria-label="보내기"`).
- 모바일: `packages/ui/src/ChatBubble.tsx`.
