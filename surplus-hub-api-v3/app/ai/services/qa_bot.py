"""Chat suggestion, community QA, and discussion summary services."""

import json
import logging
from typing import List

from sqlalchemy.orm import Session

from app.ai.clients.openai_client import (
    DEFAULT_MODEL,
    REASONING_MODEL,
    _map_model,
    generate_text,
    generate_text_with_history,
)
from app.ai.text import strip_markdown
from app.ai.prompts.chat_qa import (
    CHAT_SUGGESTION_PROMPT,
    COMMUNITY_ANSWER_PROMPT,
    SUMMARIZE_DISCUSSION_PROMPT,
)
from app.models.chat import ChatRoom, Message
from app.models.community import Comment, Post
from app.schemas.ai_schemas import (
    ChatSuggestionResponse,
    CommunityAnswerResponse,
    SummarizeResponse,
)

logger = logging.getLogger(__name__)


def generate_chat_suggestions(
    db: Session,
    room_id: int,
    current_user_id: int,
) -> ChatSuggestionResponse:
    """Generate 3 quick reply suggestions for a chat room."""
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        return ChatSuggestionResponse(suggestions=["안녕하세요!", "확인했습니다.", "감사합니다."])

    # Get recent messages (last 10)
    messages = (
        db.query(Message)
        .filter(Message.chat_room_id == room_id)
        .order_by(Message.created_at.desc())
        .limit(10)
        .all()
    )
    messages = list(reversed(messages))

    # Build conversation history
    history = []
    for msg in messages:
        role = "assistant" if msg.sender_id == current_user_id else "user"
        if msg.message_type == "LOCATION":
            try:
                loc = json.loads(msg.content)
                display = f"[위치 공유: {loc.get('address', '위치 정보')}]"
            except (json.JSONDecodeError, TypeError):
                display = "[위치 공유]"
            history.append({"role": role, "content": display})
        elif msg.message_type == "IMAGE":
            history.append({"role": role, "content": "[이미지]"})
        else:
            history.append({"role": role, "content": msg.content})

    # Add material context if available
    material_context = ""
    if room.material:
        m = room.material
        material_context = (
            f"\n[거래 자재 정보] {m.title} / {m.price:,}원 / "
            f"카테고리: {m.category or '미분류'} / 상태: {m.status}"
        )

    system_prompt = CHAT_SUGGESTION_PROMPT + material_context

    # If no history, add a starter
    if not history:
        history.append({"role": "user", "content": "거래 채팅이 시작되었습니다."})

    raw = generate_text_with_history(
        system_prompt=system_prompt,
        messages=history,
        model=DEFAULT_MODEL,
        max_tokens=256,
        temperature=0.8,
    )

    # Parse JSON array
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        suggestions = json.loads(text)
        if not isinstance(suggestions, list):
            suggestions = ["확인했습니다.", "감사합니다.", "네, 좋습니다."]
    except json.JSONDecodeError:
        logger.warning("Chat suggestion LLM returned non-JSON: %s", text[:200])
        suggestions = ["확인했습니다.", "감사합니다.", "네, 좋습니다."]

    return ChatSuggestionResponse(
        suggestions=[strip_markdown(str(s)) for s in suggestions[:3]]
    )


def generate_community_answer(
    db: Session,
    post_id: int,
) -> CommunityAnswerResponse:
    """Generate an AI answer for a community post."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        return CommunityAnswerResponse(
            answer="해당 게시글을 찾을 수 없습니다.",
            modelUsed=_map_model(DEFAULT_MODEL),
        )

    # Use reasoning model for long content or safety-related questions
    use_reasoning = len(post.content) > 500 or (
        post.category and post.category.lower() in ("safety", "안전")
    )
    model = REASONING_MODEL if use_reasoning else DEFAULT_MODEL

    user_prompt = f"[{post.category or '일반'}] {post.title}\n\n{post.content}"

    answer = generate_text(
        system_prompt=COMMUNITY_ANSWER_PROMPT,
        user_prompt=user_prompt,
        model=model,
        max_tokens=1024,
        temperature=0.5,
    )

    return CommunityAnswerResponse(
        answer=strip_markdown(answer),
        modelUsed=_map_model(model),
    )


def summarize_discussion(
    db: Session,
    post_id: int,
) -> SummarizeResponse:
    """Summarize a community post and its comments."""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        return SummarizeResponse(
            summary="해당 게시글을 찾을 수 없습니다.",
            keyPoints=[],
        )

    # Get comments (max 100)
    comments = (
        db.query(Comment)
        .filter(Comment.post_id == post_id)
        .order_by(Comment.created_at)
        .limit(100)
        .all()
    )

    # Build discussion text
    parts = [f"[게시글] {post.title}\n{post.content}"]
    for i, c in enumerate(comments, 1):
        parts.append(f"[댓글 {i}] {c.content}")

    user_prompt = "\n\n".join(parts)

    raw = generate_text(
        system_prompt=SUMMARIZE_DISCUSSION_PROMPT,
        user_prompt=user_prompt,
        model=DEFAULT_MODEL,
        max_tokens=512,
        temperature=0.3,
    )

    # Parse JSON
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3].strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Summarize LLM returned non-JSON: %s", text[:200])
        data = {"summary": raw.strip()[:300], "key_points": []}

    return SummarizeResponse(
        summary=strip_markdown(str(data.get("summary", ""))),
        keyPoints=[strip_markdown(str(p)) for p in data.get("key_points", [])],
    )
