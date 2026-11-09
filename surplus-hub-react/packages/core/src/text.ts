/**
 * AI가 만든 설명·답변에 남은 마크다운 기호를 평문으로 정리한다 (표시용 — 편집 값에는 쓰지 않는다).
 * 백엔드 app/ai/text.py strip_markdown과 같은 규칙. 케이스 표: surplus-hub-api-v3/app/tests/fixtures/ai_text_cases.json
 * lookbehind는 구형 Safari에서 문법 오류라 쓰지 않고, 앞 글자를 그룹으로 잡아 되돌려 넣는다.
 */
const W = "\\p{L}\\p{N}_"; // Python \w

// 강조 기호를 찾기 전에 빼 두는 토큰 — 메일·URL 안의 `__`는 서식이 아니다
const PROTECTED = new RegExp(`(?:https?://|www\\.)[^\\s*]+|[${W}.+-]+@[${W}-]+(?:\\.[${W}-]+)+`, "gu");
const LINK = /\[([^\]\n]+)\]\((?:[^()\s]|\([^()\s]*\))+\)/g;
const CODE = /`([^`\n]+)`/g;
const BOLD = new RegExp(`(^|[^${W}*])\\*\\*(?![\\s*])([^\\n]*?[^\\s*])\\*\\*(?!\\*)`, "gmu");
const UNDER = new RegExp(`(^|[^${W}_])__(?![\\s_])([^\\n]*?[^\\s_])__(?![${W}_])`, "gmu");
const ITALIC = new RegExp(`(^|[^${W}*])\\*(?![\\s*])([^*\\n]*?[^\\s*])\\*(?![${W}*])`, "gmu");

export const stripMarkdown = (text: string): string => {
  const saved: string[] = [];
  let out = text
    .replace(LINK, "$1")
    .replace(PROTECTED, (m) => `\u0000${saved.push(m) - 1}\u0000`)
    .replace(CODE, "$1");
  for (const pattern of [BOLD, UNDER, ITALIC]) out = out.replace(pattern, "$1$2");
  return out
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^([ \t]*)[*+][ \t]+/gm, "$1- ")
    .replace(/\u0000(\d+)\u0000/g, (_, i: string) => saved[Number(i)] ?? "")
    .trim();
};
