import asyncio
from datetime import datetime, timezone
import logging

import jwt
from jwt import PyJWKClient
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.ws_manager import manager
from app.core.notify import notify
from app.crud.crud_chat import crud_chat_room, crud_message
from app.db.session import SessionLocal
from app.models.user import User
from app.utils.location import LocationData

logger = logging.getLogger(__name__)

# Clerk JWKS URL from config (singleton client to enable key caching)
_clerk_jwks_url = settings.CLERK_JWKS_URL or "https://adapted-perch-14.clerk.accounts.dev/.well-known/jwks.json"
_jwks_client = PyJWKClient(_clerk_jwks_url)

router = APIRouter()


def get_db_session() -> Session:
    return SessionLocal()


def authenticate_ws_token(token: str, db: Session) -> int | None:
    """Validate JWT token and return user_id. Supports both Clerk RS256 and local HS256."""
    # 1. Clerk RS256 검증 시도
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        clerk_id = payload.get("sub")
        if not clerk_id:
            return None
        user = db.query(User).filter(User.clerk_id == clerk_id).first()
        if user:
            return user.id
        return None
    except Exception:
        pass

    # 2. 로컬 HS256 검증 폴백
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return int(user_id)
    except jwt.PyJWTError:
        return None


@router.websocket("/chat/{room_id}")
async def websocket_chat(
    websocket: WebSocket,
    room_id: int,
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time chat.

    Connect: ws://host/ws/chat/{room_id}?token={jwt_token}

    Client -> Server messages:
    - {"type": "text", "content": "hello"}
    - {"type": "image", "content": "https://s3.../image.jpg"}
    - {"type": "location", "content": {"latitude": 37.5, "longitude": 127.0, "address": "...", "title": "..."}}
    - {"type": "read"}  -- mark messages as read
    - {"type": "typing"}  -- typing indicator

    Server -> Client messages:
    - {"type": "message", "data": {...message data...}}
    - {"type": "read_receipt", "data": {"userId": int, "readAt": str}}
    - {"type": "typing", "data": {"userId": int, "userName": str}}
    - {"type": "error", "data": {"detail": str}}
    """
    # Authenticate (need db for Clerk token -> user_id lookup)
    db = get_db_session()
    try:
        user_id = authenticate_ws_token(token, db)
    except Exception:
        db.close()
        await websocket.close(code=4001, reason="Invalid token")
        return

    if user_id is None:
        db.close()
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Verify room access
    try:
        room = crud_chat_room.get(db, id=room_id)
        if not room:
            await websocket.close(code=4004, reason="Room not found")
            return

        if not crud_chat_room.is_participant(room, user_id):
            await websocket.close(code=4003, reason="Not a participant")
            return

        user = db.query(User).filter(User.id == user_id).first()
        user_name = user.name if user else "Unknown"
    finally:
        db.close()

    # Connect
    await manager.connect(websocket, room_id, user_id)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "pong":
                manager.record_pong(websocket)
                continue

            if msg_type in ("text", "image"):
                content = data.get("content", "")
                if not content:
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "data": {"detail": "Content is required"}
                    })
                    continue

                message_type = "TEXT" if msg_type == "text" else "IMAGE"

                db = get_db_session()
                try:
                    msg = crud_message.create_message(
                        db,
                        room_id=room_id,
                        sender_id=user_id,
                        content=content,
                        message_type=message_type,
                    )

                    message_data = {
                        "type": "message",
                        "data": {
                            "id": msg.id,
                            "content": msg.content,
                            "messageType": msg.message_type,
                            "senderId": msg.sender_id,
                            "senderName": user_name,
                            "isRead": msg.is_read,
                            "createdAt": msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
                        }
                    }

                    # Send push notification to offline users
                    try:
                        room = crud_chat_room.get(db, id=room_id)
                        if room:
                            other_user_id = room.seller_id if room.buyer_id == user_id else room.buyer_id
                            if not manager.is_user_online_in_room(room_id, other_user_id):
                                # 블로킹 HTTP 푸시 호출이므로 이벤트 루프를 막지 않게 스레드로 넘긴다
                                await asyncio.to_thread(
                                    notify,
                                    db,
                                    user_id=other_user_id,
                                    type="CHAT",
                                    title=user_name,
                                    body=content[:100],
                                    reference_type="chat_room",
                                    reference_id=room_id,
                                    data={"roomId": str(room_id)},
                                )
                    except Exception as e:
                        logger.error(f"Failed to send notification for room {room_id}: {e}")
                finally:
                    db.close()

                # Broadcast to room (exclude sender), then send confirmation to sender
                await manager.broadcast_to_room(room_id, message_data, exclude=websocket)
                await manager.send_personal(websocket, message_data)

            elif msg_type == "location":
                content_data = data.get("content")
                try:
                    location = LocationData.from_dict(content_data)
                    content = location.to_json_string()
                except (ValueError, TypeError, AttributeError) as e:
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "data": {"detail": f"Invalid location data: {e}"}
                    })
                    continue

                db = get_db_session()
                try:
                    msg = crud_message.create_message(
                        db,
                        room_id=room_id,
                        sender_id=user_id,
                        content=content,
                        message_type="LOCATION",
                    )

                    message_data = {
                        "type": "message",
                        "data": {
                            "id": msg.id,
                            "content": msg.content,
                            "messageType": msg.message_type,
                            "senderId": msg.sender_id,
                            "senderName": user_name,
                            "isRead": msg.is_read,
                            "createdAt": msg.created_at.isoformat() if msg.created_at else datetime.now(timezone.utc).isoformat(),
                        }
                    }

                    # Send push notification to offline users
                    try:
                        room = crud_chat_room.get(db, id=room_id)
                        if room:
                            other_user_id = room.seller_id if room.buyer_id == user_id else room.buyer_id
                            if not manager.is_user_online_in_room(room_id, other_user_id):
                                # 블로킹 HTTP 푸시 호출이므로 이벤트 루프를 막지 않게 스레드로 넘긴다
                                await asyncio.to_thread(
                                    notify,
                                    db,
                                    user_id=other_user_id,
                                    type="CHAT",
                                    title=user_name,
                                    body=content[:100],
                                    reference_type="chat_room",
                                    reference_id=room_id,
                                    data={"roomId": str(room_id)},
                                )
                    except Exception as e:
                        logger.error(f"Failed to send notification for room {room_id}: {e}")
                finally:
                    db.close()

                await manager.broadcast_to_room(room_id, message_data, exclude=websocket)
                await manager.send_personal(websocket, message_data)

            elif msg_type == "read":
                db = get_db_session()
                try:
                    count = crud_message.mark_as_read(db, room_id=room_id, user_id=user_id)
                finally:
                    db.close()

                if count > 0:
                    await manager.broadcast_to_room(room_id, {
                        "type": "read_receipt",
                        "data": {
                            "userId": user_id,
                            "readAt": datetime.now(timezone.utc).isoformat(),
                        }
                    }, exclude=websocket)

            elif msg_type == "typing":
                await manager.broadcast_to_room(room_id, {
                    "type": "typing",
                    "data": {
                        "userId": user_id,
                        "userName": user_name,
                    }
                }, exclude=websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
    except Exception as e:
        logger.error(f"WebSocket error in room {room_id} for user {user_id}: {e}", exc_info=True)
        manager.disconnect(websocket, room_id)
