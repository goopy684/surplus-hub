"""LLM 출력 텍스트 후처리.

웹 packages/core/src/text.ts와 같은 규칙. 케이스 표: app/tests/fixtures/ai_text_cases.json
"""

import re

# 강조 기호를 찾기 전에 빼 두는 토큰 — `sales__kr@example.com`, `https://x.y/a__b`의 `__`는 서식이 아니다
_PROTECTED = re.compile(r"(?:https?://|www\.)[^\s*]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# [텍스트](링크) — 링크 안의 괄호 한 겹까지 (`cert_(1).pdf`)
_LINK = re.compile(r"\[([^\]\n]+)\]\((?:[^()\s]|\([^()\s]*\))+\)")
_CODE = re.compile(r"`([^`\n]+)`")
# 짝이 맞는 강조만. 여는 기호 앞은 줄 시작·공백·문장부호여야 한다 (`600*600`, `a__b`는 그대로).
# `**`는 한국어 조사가 바로 붙으므로(`**습기 관리**가`) 닫는 쪽 뒤 글자는 보지 않는다.
_BOLD = re.compile(r"(^|[^\w*])\*\*(?![\s*])([^\n]*?[^\s*])\*\*(?!\*)", re.M)
_UNDER = re.compile(r"(^|[^\w_])__(?![\s_])([^\n]*?[^\s_])__(?![\w_])", re.M)
_ITALIC = re.compile(r"(^|[^\w*])\*(?![\s*])([^*\n]*?[^\s*])\*(?![\w*])", re.M)
_HEADING = re.compile(r"^[ \t]*#{1,6}[ \t]+", re.M)
_BULLET = re.compile(r"^([ \t]*)[*+][ \t]+", re.M)


def strip_markdown(text: str) -> str:
    """LLM이 붙인 마크다운 기호를 걷어내 평문으로 만든다 (화면은 평문으로 그린다)."""
    text = _LINK.sub(r"\1", text)
    saved: list = []

    def _save(m: "re.Match[str]") -> str:
        saved.append(m.group(0))
        return f"\x00{len(saved) - 1}\x00"

    text = _PROTECTED.sub(_save, text)
    text = _CODE.sub(r"\1", text)
    for pattern in (_BOLD, _UNDER, _ITALIC):
        text = pattern.sub(r"\1\2", text)
    text = _HEADING.sub("", text)
    text = _BULLET.sub(r"\1- ", text)
    text = re.sub(r"\x00(\d+)\x00", lambda m: saved[int(m.group(1))], text)
    return text.strip()
