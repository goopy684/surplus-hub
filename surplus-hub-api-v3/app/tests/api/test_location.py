"""Tests for LOCATION message type -- map integration.

Covers:
  - WebSocket LOCATION message send/receive
  - LOCATION data validation (missing fields, invalid ranges, wrong types)
  - Sequential LOCATION message ordering
  - REST API LOCATION message validation
"""

import json
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token
from app.core.ws_manager import manager
from app.models.chat import ChatRoom, Message
from app.tests.conftest import TestingSessionLocal

API = settings.API_V1_STR


# ===================================================================
# Helpers
# ===================================================================

@pytest.fixture(autouse=True)
def cleanup_manager():
    """Clean up manager state before and after each test."""
    manager.active_connections.clear()
    manager.connection_user_map.clear()
    manager._user_connection_count.clear()
    manager._total_connections = 0
    for task in list(manager._heartbeat_tasks.values()):
        if not task.done():
            task.cancel()
    manager._heartbeat_tasks.clear()
    manager._last_pong.clear()
    yield
    manager.active_connections.clear()
    manager.connection_user_map.clear()
    manager._user_connection_count.clear()
    manager._total_connections = 0
    for task in list(manager._heartbeat_tasks.values()):
        if not task.done():
            task.cancel()
    manager._heartbeat_tasks.clear()
    manager._last_pong.clear()


@pytest.fixture()
def test_room(test_user, test_user2):
    """Create a chat room for location tests."""
    db = TestingSessionLocal()
    try:
        room = ChatRoom(buyer_id=test_user.id, seller_id=test_user2.id)
        db.add(room)
        db.commit()
        db.refresh(room)
        return room
    finally:
        db.close()


# ===================================================================
# WebSocket LOCATION -- happy path
# ===================================================================

class TestWebSocketLocationMessage:
    """WebSocket LOCATION message send and broadcast."""

    def test_location_message_broadcast(
        self, client: TestClient, test_room, test_user, test_user2
    ):
        """User1 sends LOCATION, user2 receives it with correct messageType."""
        token1 = create_access_token(subject=test_user.id)
        token2 = create_access_token(subject=test_user2.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token1}"
            ) as ws1:
                with client.websocket_connect(
                    f"/ws/chat/{test_room.id}?token={token2}"
                ) as ws2:
                    ws1.send_json({
                        "type": "location",
                        "content": {
                            "latitude": 37.5665,
                            "longitude": 126.9780,
                            "address": "Seoul City Hall",
                            "title": "Meeting Point",
                        }
                    })

                    # User2 receives broadcast
                    data2 = ws2.receive_json()
                    assert data2["type"] == "message"
                    assert data2["data"]["messageType"] == "LOCATION"
                    parsed = json.loads(data2["data"]["content"])
                    assert parsed["latitude"] == 37.5665
                    assert parsed["longitude"] == 126.9780
                    assert parsed["address"] == "Seoul City Hall"
                    assert parsed["title"] == "Meeting Point"

                    # User1 receives confirmation
                    data1 = ws1.receive_json()
                    assert data1["type"] == "message"
                    assert data1["data"]["messageType"] == "LOCATION"

    def test_location_message_persisted_to_db(
        self, client: TestClient, test_room, test_user
    ):
        """LOCATION message should be saved in the database."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "location",
                    "content": {
                        "latitude": 35.1796,
                        "longitude": 129.0756,
                        "address": "Busan",
                    }
                })
                response = ws.receive_json()
                assert response["type"] == "message"

        time.sleep(0.1)
        db = TestingSessionLocal()
        try:
            msg = db.query(Message).filter(
                Message.chat_room_id == test_room.id,
                Message.message_type == "LOCATION",
            ).first()
            assert msg is not None
            assert msg.sender_id == test_user.id
            parsed = json.loads(msg.content)
            assert parsed["latitude"] == 35.1796
            assert parsed["address"] == "Busan"
        finally:
            db.close()

    def test_location_without_optional_fields(
        self, client: TestClient, test_room, test_user
    ):
        """LOCATION with only lat/lng (no address/title) should succeed."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "location",
                    "content": {"latitude": 37.0, "longitude": 127.0}
                })
                data = ws.receive_json()
                assert data["type"] == "message"
                assert data["data"]["messageType"] == "LOCATION"
                parsed = json.loads(data["data"]["content"])
                assert parsed["latitude"] == 37.0
                assert parsed["longitude"] == 127.0
                assert "address" not in parsed
                assert "title" not in parsed


# ===================================================================
# WebSocket LOCATION -- validation errors
# ===================================================================

class TestWebSocketLocationValidation:
    """LOCATION message data validation failure tests."""

    def test_location_missing_latitude(
        self, client: TestClient, test_room, test_user
    ):
        """Missing latitude should return error."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "location",
                    "content": {"longitude": 126.978}
                })
                data = ws.receive_json()
                assert data["type"] == "error"
                assert "latitude" in data["data"]["detail"].lower()

    def test_location_missing_longitude(
        self, client: TestClient, test_room, test_user
    ):
        """Missing longitude should return error."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "location",
                    "content": {"latitude": 37.5}
                })
                data = ws.receive_json()
                assert data["type"] == "error"
                assert "latitude" in data["data"]["detail"].lower() or \
                       "longitude" in data["data"]["detail"].lower()

    def test_location_invalid_latitude_range(
        self, client: TestClient, test_room, test_user
    ):
        """Latitude out of range should return error."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "location",
                    "content": {"latitude": 999.0, "longitude": 126.978}
                })
                data = ws.receive_json()
                assert data["type"] == "error"

    def test_location_invalid_longitude_range(
        self, client: TestClient, test_room, test_user
    ):
        """Longitude out of range should return error."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "location",
                    "content": {"latitude": 37.5, "longitude": 999.0}
                })
                data = ws.receive_json()
                assert data["type"] == "error"

    def test_location_non_numeric_coordinates(
        self, client: TestClient, test_room, test_user
    ):
        """Non-numeric coordinates should return error."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "location",
                    "content": {"latitude": "invalid", "longitude": "bad"}
                })
                data = ws.receive_json()
                assert data["type"] == "error"

    def test_location_content_not_dict(
        self, client: TestClient, test_room, test_user
    ):
        """Content that is not a dict should return error."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "location",
                    "content": "not a dict"
                })
                data = ws.receive_json()
                assert data["type"] == "error"


# ===================================================================
# Sequential LOCATION messages -- ordering
# ===================================================================

class TestLocationConcurrency:
    """LOCATION message ordering tests."""

    def test_sequential_location_messages_maintain_order(
        self, client: TestClient, test_room, test_user, test_user2
    ):
        """10 LOCATION messages sent sequentially should maintain order in DB."""
        token1 = create_access_token(subject=test_user.id)
        token2 = create_access_token(subject=test_user2.id)

        locations = [
            {"latitude": 37.0 + i * 0.01, "longitude": 127.0 + i * 0.01,
             "address": f"Location {i}"}
            for i in range(10)
        ]

        with patch("app.api.endpoints.ws.get_db_session",
                    side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token1}"
            ) as ws1:
                with client.websocket_connect(
                    f"/ws/chat/{test_room.id}?token={token2}"
                ) as ws2:
                    for loc in locations:
                        ws1.send_json({"type": "location", "content": loc})
                        # ws2 receives broadcast
                        data = ws2.receive_json()
                        assert data["type"] == "message"
                        assert data["data"]["messageType"] == "LOCATION"
                        # ws1 receives confirmation
                        data1 = ws1.receive_json()
                        assert data1["type"] == "message"

        # Verify DB ordering
        db = TestingSessionLocal()
        try:
            msgs = (
                db.query(Message)
                .filter(
                    Message.chat_room_id == test_room.id,
                    Message.message_type == "LOCATION",
                )
                .order_by(Message.id)
                .all()
            )
            assert len(msgs) == 10
            for i, msg in enumerate(msgs):
                parsed = json.loads(msg.content)
                assert abs(parsed["latitude"] - (37.0 + i * 0.01)) < 0.001
                assert parsed["address"] == f"Location {i}"
        finally:
            db.close()


# ===================================================================
# REST API LOCATION messages
# ===================================================================

class TestRestLocationMessage:
    """REST API LOCATION message tests."""

    def test_send_location_via_rest(
        self, client: TestClient, test_room, auth_headers
    ):
        """POST LOCATION message via REST API should succeed."""
        loc_content = json.dumps({
            "latitude": 37.5665,
            "longitude": 126.9780,
            "address": "Seoul",
        })
        resp = client.post(
            f"{API}/chats/rooms/{test_room.id}/messages",
            json={"content": loc_content, "messageType": "LOCATION"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["messageType"] == "LOCATION"

    def test_rest_location_multiple_messages(
        self, client: TestClient, test_room, auth_headers
    ):
        """Multiple LOCATION messages via REST should all be saved."""
        for i in range(5):
            loc_content = json.dumps({
                "latitude": 35.0 + i * 0.1,
                "longitude": 129.0 + i * 0.1,
                "address": f"REST Location {i}",
            })
            resp = client.post(
                f"{API}/chats/rooms/{test_room.id}/messages",
                json={"content": loc_content, "messageType": "LOCATION"},
                headers=auth_headers,
            )
            assert resp.status_code == 200

        db = TestingSessionLocal()
        try:
            msgs = (
                db.query(Message)
                .filter(
                    Message.chat_room_id == test_room.id,
                    Message.message_type == "LOCATION",
                )
                .all()
            )
            assert len(msgs) == 5
        finally:
            db.close()

    def test_rest_location_invalid_json_content(
        self, client: TestClient, test_room, auth_headers
    ):
        """LOCATION with non-JSON content should return 422."""
        resp = client.post(
            f"{API}/chats/rooms/{test_room.id}/messages",
            json={"content": "not valid json", "messageType": "LOCATION"},
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_rest_location_missing_coordinates(
        self, client: TestClient, test_room, auth_headers
    ):
        """LOCATION with missing lat/lng should return 422."""
        resp = client.post(
            f"{API}/chats/rooms/{test_room.id}/messages",
            json={
                "content": json.dumps({"address": "No coordinates"}),
                "messageType": "LOCATION",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422

    def test_rest_location_invalid_range(
        self, client: TestClient, test_room, auth_headers
    ):
        """LOCATION with out-of-range coordinates should return 422."""
        resp = client.post(
            f"{API}/chats/rooms/{test_room.id}/messages",
            json={
                "content": json.dumps({"latitude": 999, "longitude": 127}),
                "messageType": "LOCATION",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 422
