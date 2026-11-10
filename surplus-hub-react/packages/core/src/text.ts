/**
 * AI가 만든 설명·답변에 남은 마크다운 기호를 평문으로 정리한다 (표시용 — 편집 값에는 쓰지 않는다).
 * 백엔드 app/ai/text.py strip_markdown과 같은 규칙. 케이스 표: surplus-hub-api-v3/app/tests/fixtures/ai_text_cases.json
 * lookbehind는 구형 Safari에서 문법 오류라 쓰지 않고, 앞 글자를 그룹으로 잡아 되돌려 넣는다.
 */
const W = "\\p{L}\\p{N}_"; // Python \w
// 보호 토큰 자리표시 — 사설 영역 문자(U+E000)라 글자·공백으로 취급되지 않고 일반 텍스트에 나오지 않는다
const MARK = "\uE000";

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
    .split(MARK) // 입력에 원래 있던 자리표시 문자는 버린다
    .join("")
    .replace(LINK, "$1")
    // 끝의 `_`는 닫는 강조(`__https://x.y/a__b__`)일 수 있으니 토큰 밖에 남긴다
    .replace(PROTECTED, (m) => {
      const core = m.replace(/_+$/, "");
      return `${MARK}${saved.push(core) - 1}${MARK}${m.slice(core.length)}`;
    })
    .replace(CODE, "$1");
  for (const pattern of [BOLD, UNDER, ITALIC]) out = out.replace(pattern, "$1$2");
  return out
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^([ \t]*)[*+][ \t]+/gm, "$1- ")
    .replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (_, i: string) => saved[Number(i)] ?? "")
    .trim();
};
