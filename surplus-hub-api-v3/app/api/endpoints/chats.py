import asyncio
import json
from typing import Any, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.ws_manager import manager
from app.core.notify import notify
from app.crud.crud_chat import crud_chat_room, crud_message
from app.models.user import User
from app.utils.location import LocationData
from app.schemas.chat_response import (
    ChatRoomListResponse,
    ChatRoom as ChatRoomSchema,
    ChatRoomCreate,
    MessageListResponse,
    Message as MessageSchema,
    MessageCreate
)

router = APIRouter()

def _room_to_schema(room, current_user_id: int, db: Session) -> ChatRoomSchema:
    other_user = room.seller if room.buyer_id == current_user_id else room.buyer
    last_msg = crud_message.get_last_message(db, room_id=room.id)
    unread_count = crud_message.get_unread_count(db, room_id=room.id, user_id=current_user_id)
    return ChatRoomSchema(
        id=room.id,
        materialId=room.material_id,
        materialTitle=room.material.title if room.material else None,
        otherUserId=other_user.id,
        otherUserName=other_user.name,
        otherUserAvatar=other_user.profile_image_url,
        lastMessage=last_msg.content if last_msg else None,
        lastMessageTime=last_msg.created_at if last_msg else room.created_at,
        unreadCount=unread_count,
    )


@router.get("/rooms", response_model=ChatRoomListResponse, summary="List Chat Rooms")
def read_chat_rooms(
    db: Session = Depends(deps.get_db),
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(deps.get_current_active_user),
    cursor: Optional[int] = None,
) -> Any:
    # Cursor-based pagination
    if cursor is not None or page == 0:
        items, next_cursor = crud_chat_room.get_user_rooms_cursor(
            db, user_id=current_user.id, cursor=cursor, limit=limit
        )
        data = [_room_to_schema(room, current_user.id, db) for room in items]
        return {
            "status": "success",
            "data": data,
            "meta": {
                "nextCursor": next_cursor,
                "hasMore": next_cursor is not None,
                "limit": limit,
            },
        }

    # Offset-based pagination
    skip = (page - 1) * limit
    rooms, total_count = crud_chat_room.get_user_rooms(db, user_id=current_user.id, skip=skip, limit=limit)

    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 0
    has_next_page = page < total_pages

    data = [_room_to_schema(room, current_user.id, db) for room in rooms]

    return {
        "status": "success",
        "data": data,
        "meta": {
            "totalCount": total_count,
            "page": page,
            "limit": limit,
            "hasNextPage": has_next_page,
            "totalPages": total_pages
        }
    }

@router.post("/rooms", summary="Create Chat Room")
def create_chat_room(
    room_in: ChatRoomCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    room, created = crud_chat_room.get_or_create(
        db, material_id=room_in.material_id, buyer_id=current_user.id, seller_id=room_in.seller_id
    )
    return {"status": "success", "data": {"id": room.id}}

@router.get("/rooms/{room_id}/messages", response_model=MessageListResponse, summary="List Messages")
def read_messages(
    room_id: int,
    db: Session = Depends(deps.get_db),
    page: int = 1,
    limit: int = 50,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    room = crud_chat_room.get(db, id=room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Chat room not found")

    if not crud_chat_room.is_participant(room, current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to access this chat room")

    skip = (page - 1) * limit
    messages, total_count = crud_message.get_room_messages(db, room_id=room_id, skip=skip, limit=limit)

    crud_message.mark_as_read(db, room_id=room_id, user_id=current_user.id)

    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 0
    has_next_page = page < total_pages

    return {
        "status": "success",
        "data": messages,
        "meta": {
            "totalCount": total_count,
            "page": page,
            "limit": limit,
            "hasNextPage": has_next_page,
            "totalPages": total_pages
        }
    }

def _create_message_sync(
    db: Session, room_id: int, sender_id: int, content: str, message_type: str
) -> dict:
    """Execute all sync DB operations for message creation in a thread."""
    room = crud_chat_room.get(db, id=room_id)
    if not room:
        return {"error": "Chat room not found", "status_code": 404}

    if not crud_chat_room.is_participant(room, sender_id):
        return {"error": "Not authorized to send message to this chat room", "status_code": 403}

    msg = crud_message.create_message(
        db, room_id=room_id, sender_id=sender_id,
        content=content, message_type=message_type,
    )

    other_user_id = room.seller_id if room.buyer_id == sender_id else room.buyer_id

    return {
        "msg": msg,
        "room": room,
        "other_user_id": other_user_id,
    }


@router.post("/rooms/{room_id}/messages", summary="Send Message")
async def create_message(
    room_id: int,
    message_in: MessageCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    # Validate LOCATION message content
    content = message_in.content
    if message_in.message_type == "LOCATION":
        try:
            location = LocationData.from_json_string(content)
            content = location.to_json_string()
        except (ValueError, json.JSONDecodeError) as e:
            raise HTTPException(status_code=422, detail=f"Invalid location data: {e}")

    # Run all sync DB operations in a thread to avoid blocking the event loop
    result = await asyncio.to_thread(
        _create_message_sync,
        db, room_id, current_user.id, content, message_in.message_type,
    )

    if "error" in result:
        raise HTTPException(status_code=result["status_code"], detail=result["error"])

    msg = result["msg"]
    other_user_id = result["other_user_id"]

    # Broadcast via WebSocket to room participants
    message_data = {
        "type": "message",
        "data": {
            "id": msg.id,
            "content": msg.content,
            "messageType": msg.message_type,
            "senderId": msg.sender_id,
            "senderName": current_user.name,
            "isRead": msg.is_read,
            "createdAt": msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
        }
    }
    await manager.broadcast_to_room(room_id, message_data)

    # Push notification to offline recipient
    if not manager.is_user_online_in_room(room_id, other_user_id):
        await asyncio.to_thread(
            notify,
            db,
            user_id=other_user_id,
            type="CHAT",
            title=current_user.name,
            body=message_in.content[:100],
            reference_type="chat_room",
            reference_id=room_id,
            data={"roomId": str(room_id)},
        )

    return {
        "status": "success",
        "data": MessageSchema.model_validate(msg)
    }
