"""LLM 출력 텍스트 후처리."""

import re


def strip_markdown(text: str) -> str:
    """LLM이 붙인 마크다운 기호를 걷어내 평문으로 만든다.

    화면은 description/answer를 평문으로 그리므로 `**규격:**` 같은 기호가 그대로 보인다.
    `600*600`처럼 규격에 쓰이는 단독 `*`는 건드리지 않는다.
    """
    text = re.sub(r"\*\*|__|`", "", text)
    text = re.sub(r"^[ \t]*#{1,6}[ \t]+", "", text, flags=re.M)  # 제목
    text = re.sub(r"^([ \t]*)[*+][ \t]+", r"\1- ", text, flags=re.M)  # 글머리표
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)  # [텍스트](링크)
    return text.strip()
