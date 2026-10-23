"""Tests for Chat (Rooms & Messages) API endpoints.

All chat endpoints require authentication (HTTPBearer -> 401 without token).

Covers:
  - Auth requirement for every endpoint
  - Chat room creation and listing
  - Message sending and retrieval
  - Participant-only access to rooms and messages
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings

API = settings.API_V1_STR


# ===================================================================
# Chat Rooms - Auth checks
# ===================================================================

class TestChatRoomsAuth:
    """All /chats/rooms endpoints require authentication."""

    def test_list_rooms_without_auth_returns_401(self, client: TestClient):
        resp = client.get(f"{API}/chats/rooms")
        assert resp.status_code == 401

    def test_create_room_without_auth_returns_401(self, client: TestClient):
        resp = client.post(
            f"{API}/chats/rooms",
            json={"sellerId": 2},
        )
        assert resp.status_code == 401

    def test_get_messages_without_auth_returns_401(self, client: TestClient):
        resp = client.get(f"{API}/chats/rooms/1/messages")
        assert resp.status_code == 401

    def test_send_message_without_auth_returns_401(self, client: TestClient):
        resp = client.post(
            f"{API}/chats/rooms/1/messages",
            json={"content": "Hello!", "messageType": "TEXT"},
        )
        assert resp.status_code == 401


# ===================================================================
# Chat Rooms - List
# ===================================================================

class TestListChatRooms:
    """GET /chats/rooms -- lists rooms for the current user."""

    def test_list_rooms_success(self, client: TestClient, auth_headers):
        resp = client.get(f"{API}/chats/rooms", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert isinstance(body["data"], list)

    def test_list_rooms_has_meta(self, client: TestClient, auth_headers):
        resp = client.get(f"{API}/chats/rooms", headers=auth_headers)
        body = resp.json()
        meta = body["meta"]
        for key in ("totalCount", "page", "limit", "hasNextPage", "totalPages"):
            assert key in meta, f"Missing meta key: {key}"


# ===================================================================
# Chat Rooms - Create
# ===================================================================

class TestCreateChatRoom:
    """POST /chats/rooms -- create a chat room between buyer (current user) and seller."""

    def test_create_room_success(
        self, client: TestClient, auth_headers, test_user2
    ):
        resp = client.post(
            f"{API}/chats/rooms",
            json={"sellerId": test_user2.id},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "id" in body["data"]

    def test_create_room_idempotent(
        self, client: TestClient, auth_headers, test_user2
    ):
        """Creating the same room twice should return the existing room (get_or_create)."""
        resp1 = client.post(
            f"{API}/chats/rooms",
            json={"sellerId": test_user2.id},
            headers=auth_headers,
        )
        resp2 = client.post(
            f"{API}/chats/rooms",
            json={"sellerId": test_user2.id},
            headers=auth_headers,
        )
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["data"]["id"] == resp2.json()["data"]["id"]


# ===================================================================
# Messages
# ===================================================================

class TestMessages:
    """GET/POST /chats/rooms/{room_id}/messages."""

    @pytest.fixture()
    def room_id(self, client: TestClient, auth_headers, test_user2) -> int:
        """Create a room and return its ID for message tests."""
        resp = client.post(
            f"{API}/chats/rooms",
            json={"sellerId": test_user2.id},
            headers=auth_headers,
        )
        return resp.json()["data"]["id"]

    def test_get_messages_from_nonexistent_room_returns_404(
        self, client: TestClient, auth_headers
    ):
        resp = client.get(
            f"{API}/chats/rooms/999999/messages", headers=auth_headers
        )
        assert resp.status_code == 404

    def test_send_message_to_nonexistent_room_returns_404(
        self, client: TestClient, auth_headers
    ):
        resp = client.post(
            f"{API}/chats/rooms/999999/messages",
            json={"content": "Hello!", "messageType": "TEXT"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_send_message_success(
        self, client: TestClient, auth_headers, room_id
    ):
        resp = client.post(
            f"{API}/chats/rooms/{room_id}/messages",
            json={"content": "Hello!", "messageType": "TEXT"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        data = body["data"]
        assert data["content"] == "Hello!"
        assert data["messageType"] == "TEXT"
        assert "senderId" in data
        assert "createdAt" in data

    def test_get_messages_after_sending(
        self, client: TestClient, auth_headers, room_id
    ):
        # Send a message first
        client.post(
            f"{API}/chats/rooms/{room_id}/messages",
            json={"content": "Test message", "messageType": "TEXT"},
            headers=auth_headers,
        )

        resp = client.get(
            f"{API}/chats/rooms/{room_id}/messages", headers=auth_headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert isinstance(body["data"], list)
        assert len(body["data"]) >= 1

        # Check meta keys
        meta = body["meta"]
        for key in ("totalCount", "page", "limit", "hasNextPage", "totalPages"):
            assert key in meta, f"Missing meta key: {key}"

    def test_non_participant_cannot_read_messages(
        self, client: TestClient, auth_headers, auth_headers2, test_user
    ):
        """A user who is neither buyer nor seller should get 403."""
        # Create a room where test_user is both buyer and seller (self-chat),
        # then test_user2 tries to access it
        resp = client.post(
            f"{API}/chats/rooms",
            json={"sellerId": test_user.id},
            headers=auth_headers,
        )
        self_room_id = resp.json()["data"]["id"]

        resp = client.get(
            f"{API}/chats/rooms/{self_room_id}/messages",
            headers=auth_headers2,
        )
        assert resp.status_code == 403

    def test_non_participant_cannot_send_message(
        self, client: TestClient, auth_headers, auth_headers2, test_user
    ):
        """A user who is neither buyer nor seller should get 403."""
        resp = client.post(
            f"{API}/chats/rooms",
            json={"sellerId": test_user.id},
            headers=auth_headers,
        )
        self_room_id = resp.json()["data"]["id"]

        resp = client.post(
            f"{API}/chats/rooms/{self_room_id}/messages",
            json={"content": "Intruder!", "messageType": "TEXT"},
            headers=auth_headers2,
        )
        assert resp.status_code == 403


# ===================================================================
# Chat lifecycle integration test
# ===================================================================

class TestChatLifecycle:
    """End-to-end: create room -> send messages -> list rooms -> read messages."""

    def test_full_lifecycle(
        self, client: TestClient, auth_headers, auth_headers2, test_user2
    ):
        # 1. User 1 creates a chat room with user 2
        create_resp = client.post(
            f"{API}/chats/rooms",
            json={"sellerId": test_user2.id},
            headers=auth_headers,
        )
        assert create_resp.status_code == 200
        room_id = create_resp.json()["data"]["id"]

        # 2. User 1 sends a message
        msg1_resp = client.post(
            f"{API}/chats/rooms/{room_id}/messages",
            json={"content": "Hi, is this still available?", "messageType": "TEXT"},
            headers=auth_headers,
        )
        assert msg1_resp.status_code == 200

        # 3. User 2 sends a reply
        msg2_resp = client.post(
            f"{API}/chats/rooms/{room_id}/messages",
            json={"content": "Yes, it is!", "messageType": "TEXT"},
            headers=auth_headers2,
        )
        assert msg2_resp.status_code == 200

        # 4. User 1 lists their rooms -- the room should appear
        rooms_resp = client.get(f"{API}/chats/rooms", headers=auth_headers)
        assert rooms_resp.status_code == 200
        room_ids = [r["id"] for r in rooms_resp.json()["data"]]
        assert room_id in room_ids

        # 5. User 2 also sees the room in their list
        rooms_resp2 = client.get(f"{API}/chats/rooms", headers=auth_headers2)
        assert rooms_resp2.status_code == 200
        room_ids2 = [r["id"] for r in rooms_resp2.json()["data"]]
        assert room_id in room_ids2

        # 6. Get single room detail
        detail_resp = client.get(
            f"{API}/chats/rooms/{room_id}", headers=auth_headers
        )
        assert detail_resp.status_code == 200
        assert detail_resp.json()["data"]["id"] == room_id

        # 7. Read messages -- should contain both messages
        msgs_resp = client.get(
            f"{API}/chats/rooms/{room_id}/messages", headers=auth_headers
        )
        assert msgs_resp.status_code == 200
        messages = msgs_resp.json()["data"]
        assert len(messages) >= 2
        contents = [m["content"] for m in messages]
        assert "Hi, is this still available?" in contents
        assert "Yes, it is!" in contents
