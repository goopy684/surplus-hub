"""Telegram MCP Server - Telethon 기반 대화 조회/분석."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from telethon import TelegramClient
from telethon.tl.types import Channel, Chat, User

load_dotenv()

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION_PATH = str(Path(__file__).parent / "telegram_session")

mcp = FastMCP("telegram", instructions="Telegram 대화 조회 및 분석 MCP 서버")

# 싱글턴 클라이언트
_client: TelegramClient | None = None


async def get_client() -> TelegramClient:
    """Telethon 클라이언트를 반환 (최초 호출 시 연결)."""
    global _client
    if _client is None or not _client.is_connected():
        _client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
        await _client.start()
    return _client


def _entity_name(entity) -> str:
    if isinstance(entity, User):
        parts = [entity.first_name or "", entity.last_name or ""]
        return " ".join(p for p in parts if p) or str(entity.id)
    if isinstance(entity, (Chat, Channel)):
        return entity.title or str(entity.id)
    return str(getattr(entity, "id", entity))


def _msg_to_dict(msg) -> dict:
    return {
        "id": msg.id,
        "date": msg.date.isoformat() if msg.date else None,
        "sender_id": msg.sender_id,
        "text": msg.text or "",
        "reply_to": msg.reply_to_msg_id if msg.reply_to else None,
    }


# ─── Tools ───────────────────────────────────────────────


@mcp.tool()
async def list_dialogs(limit: int = 30) -> str:
    """대화 목록을 조회합니다.

    Args:
        limit: 가져올 대화 수 (기본 30)
    """
    client = await get_client()
    dialogs = await client.get_dialogs(limit=limit)
    result = []
    for d in dialogs:
        result.append({
            "id": d.id,
            "name": d.name,
            "type": type(d.entity).__name__,
            "unread": d.unread_count,
            "last_message_date": d.date.isoformat() if d.date else None,
        })
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def get_messages(
    chat: str,
    limit: int = 50,
    offset_date: str | None = None,
    search: str | None = None,
) -> str:
    """특정 대화방의 메시지를 가져옵니다.

    Args:
        chat: 대화방 이름, ID, 또는 username (@xxx)
        limit: 가져올 메시지 수 (기본 50, 최대 500)
        offset_date: 이 날짜 이전 메시지만 (ISO format, 예: 2026-04-01)
        search: 메시지 내 키워드 검색
    """
    client = await get_client()
    limit = min(limit, 500)

    kwargs: dict = {"limit": limit}
    if offset_date:
        kwargs["offset_date"] = datetime.fromisoformat(offset_date).replace(
            tzinfo=timezone.utc
        )
    if search:
        kwargs["search"] = search

    entity = await _resolve_entity(client, chat)
    messages = await client.get_messages(entity, **kwargs)

    result = []
    for msg in messages:
        d = _msg_to_dict(msg)
        if msg.sender:
            d["sender_name"] = _entity_name(msg.sender)
        result.append(d)

    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def get_chat_info(chat: str) -> str:
    """대화방의 상세 정보를 조회합니다.

    Args:
        chat: 대화방 이름, ID, 또는 username
    """
    client = await get_client()
    entity = await _resolve_entity(client, chat)

    info: dict = {
        "id": entity.id,
        "type": type(entity).__name__,
        "name": _entity_name(entity),
    }

    if isinstance(entity, (Chat, Channel)):
        full = await client.get_entity(entity)
        if hasattr(full, "participants_count"):
            info["participants_count"] = full.participants_count
        if hasattr(full, "about"):
            info["about"] = full.about
        if isinstance(entity, Channel):
            info["username"] = entity.username
            info["megagroup"] = entity.megagroup  # 슈퍼그룹 여부

    return json.dumps(info, ensure_ascii=False, indent=2)


@mcp.tool()
async def get_participants(chat: str, limit: int = 100) -> str:
    """대화방 참여자 목록을 조회합니다.

    Args:
        chat: 대화방 이름, ID, 또는 username
        limit: 가져올 참여자 수 (기본 100)
    """
    client = await get_client()
    entity = await _resolve_entity(client, chat)
    participants = await client.get_participants(entity, limit=limit)

    result = []
    for p in participants:
        result.append({
            "id": p.id,
            "name": _entity_name(p),
            "username": p.username,
            "bot": p.bot,
        })
    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def search_messages(
    query: str,
    chat: str | None = None,
    limit: int = 30,
) -> str:
    """메시지를 검색합니다. chat을 지정하지 않으면 전체 대화에서 검색합니다.

    Args:
        query: 검색어
        chat: 특정 대화방에서만 검색 (선택)
        limit: 결과 수 (기본 30)
    """
    client = await get_client()
    entity = await _resolve_entity(client, chat) if chat else None
    messages = await client.get_messages(entity, search=query, limit=limit)

    result = []
    for msg in messages:
        d = _msg_to_dict(msg)
        if msg.sender:
            d["sender_name"] = _entity_name(msg.sender)
        if msg.chat:
            d["chat_name"] = _entity_name(msg.chat)
        result.append(d)

    return json.dumps(result, ensure_ascii=False, indent=2)


@mcp.tool()
async def get_message_stats(chat: str, days: int = 7) -> str:
    """대화방의 메시지 통계를 생성합니다.

    Args:
        chat: 대화방 이름, ID, 또는 username
        days: 분석할 기간 (기본 7일)
    """
    client = await get_client()
    entity = await _resolve_entity(client, chat)

    from datetime import timedelta

    since = datetime.now(timezone.utc) - timedelta(days=days)
    messages = await client.get_messages(entity, offset_date=None, limit=None)

    # days 기간 내 메시지만 필터
    filtered = [m for m in messages if m.date and m.date >= since]

    # 통계 계산
    sender_counts: dict[str, int] = {}
    hourly: dict[int, int] = {h: 0 for h in range(24)}
    daily: dict[str, int] = {}

    for msg in filtered:
        # 발신자별
        name = _entity_name(msg.sender) if msg.sender else "Unknown"
        sender_counts[name] = sender_counts.get(name, 0) + 1
        # 시간대별
        hourly[msg.date.hour] += 1
        # 일별
        day_key = msg.date.strftime("%Y-%m-%d")
        daily[day_key] = daily.get(day_key, 0) + 1

    top_senders = sorted(sender_counts.items(), key=lambda x: -x[1])[:20]

    stats = {
        "chat": _entity_name(entity),
        "period_days": days,
        "total_messages": len(filtered),
        "avg_per_day": round(len(filtered) / max(days, 1), 1),
        "top_senders": [{"name": n, "count": c} for n, c in top_senders],
        "hourly_distribution": hourly,
        "daily_counts": daily,
    }
    return json.dumps(stats, ensure_ascii=False, indent=2)


# ─── Helpers ─────────────────────────────────────────────


async def _resolve_entity(client: TelegramClient, chat: str):
    """이름, ID, username 등으로 entity를 찾습니다."""
    # 숫자면 ID로 시도
    try:
        return await client.get_entity(int(chat))
    except (ValueError, TypeError):
        pass
    # @username 또는 이름으로 시도
    return await client.get_entity(chat)


if __name__ == "__main__":
    mcp.run(transport="stdio")
