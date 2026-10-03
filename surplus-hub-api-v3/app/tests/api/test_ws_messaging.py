"""Tests for WebSocket real-time messaging.

Tests WebSocket communication protocol including:
  - Text and image message sending
  - Message persistence to database
  - Read receipts
  - Typing indicators
  - Error handling
  - Pong responses
"""

import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.models.chat import ChatRoom, Message
from app.tests.conftest import TestingSessionLocal


# ===================================================================
# WebSocket Messaging Tests
# ===================================================================

class TestWSMessaging:
    """WebSocket message exchange tests."""

    @pytest.fixture()
    def test_room(self, test_user, test_user2):
        """Create a chat room for testing."""
        db = TestingSessionLocal()
        try:
            room = ChatRoom(
                buyer_id=test_user.id,
                seller_id=test_user2.id,
            )
            db.add(room)
            db.commit()
            db.refresh(room)
            return room
        finally:
            db.close()

    @pytest.fixture()
    def user1_token(self, test_user):
        """Generate JWT token for test_user."""
        return create_access_token(subject=test_user.id)

    @pytest.fixture()
    def user2_token(self, test_user2):
        """Generate JWT token for test_user2."""
        return create_access_token(subject=test_user2.id)

    def cleanup_manager(self):
        """Clean up WebSocket manager state after each test."""
        from app.core.ws_manager import manager
        manager.active_connections.clear()
        manager.connection_user_map.clear()
        manager._user_connection_count.clear()
        manager._total_connections = 0
        # Cancel all heartbeat tasks
        for task in list(manager._heartbeat_tasks.values()):
            if not task.done():
                task.cancel()
        manager._heartbeat_tasks.clear()
        manager._last_pong.clear()

    def test_send_text_message(self, client: TestClient, test_room, user1_token, test_user):
        """Test sending a text message and receiving confirmation."""
        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.notify.send_push_notification"):

            try:
                with client.websocket_connect(f"/ws/chat/{test_room.id}?token={user1_token}") as websocket:
                    # Send text message
                    websocket.send_json({
                        "type": "text",
                        "content": "Hello, world!"
                    })

                    # Receive confirmation
                    response = websocket.receive_json()

                    # Verify response
                    assert response["type"] == "message"
                    assert response["data"]["content"] == "Hello, world!"
                    assert response["data"]["messageType"] == "TEXT"
                    assert response["data"]["senderId"] == test_user.id
                    assert "createdAt" in response["data"]
            finally:
                self.cleanup_manager()

    def test_send_image_message(self, client: TestClient, test_room, user1_token, test_user):
        """Test sending an image message with correct messageType."""
        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.notify.send_push_notification"):

            try:
                with client.websocket_connect(f"/ws/chat/{test_room.id}?token={user1_token}") as websocket:
                    # Send image message
                    websocket.send_json({
                        "type": "image",
                        "content": "https://s3.amazonaws.com/bucket/image.jpg"
                    })

                    # Receive confirmation
                    response = websocket.receive_json()

                    # Verify response
                    assert response["type"] == "message"
                    assert response["data"]["content"] == "https://s3.amazonaws.com/bucket/image.jpg"
                    assert response["data"]["messageType"] == "IMAGE"
            finally:
                self.cleanup_manager()

    def test_send_empty_content_returns_error(self, client: TestClient, test_room, user1_token, test_user):
        """Test that sending empty content returns error message."""
        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.notify.send_push_notification"):

            try:
                with client.websocket_connect(f"/ws/chat/{test_room.id}?token={user1_token}") as websocket:
                    # Send message with empty content
                    websocket.send_json({
                        "type": "text",
                        "content": ""
                    })

                    # Receive error response
                    response = websocket.receive_json()

                    # Verify error response
                    assert response["type"] == "error"
                    assert "Content is required" in response["data"]["detail"]
            finally:
                self.cleanup_manager()

    def test_message_saved_to_database(self, client: TestClient, test_room, user1_token, test_user):
        """Test that WebSocket messages are persisted to database."""
        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.notify.send_push_notification"):

            db = TestingSessionLocal()
            try:
                with client.websocket_connect(f"/ws/chat/{test_room.id}?token={user1_token}") as websocket:
                    # Send message
                    test_content = "Database persistence test"
                    websocket.send_json({
                        "type": "text",
                        "content": test_content
                    })

                    # Receive confirmation
                    websocket.receive_json()

                    # Wait a bit for DB commit
                    time.sleep(0.1)

                # Verify message in database
                message = db.query(Message).filter(
                    Message.chat_room_id == test_room.id,
                    Message.content == test_content
                ).first()

                assert message is not None
                assert message.sender_id == test_user.id
                assert message.message_type == "TEXT"
                assert message.is_read is False
            finally:
                db.close()
                self.cleanup_manager()

    def test_read_receipt(self, client: TestClient, test_room, user1_token, test_user, test_user2):
        """Test read receipt updates is_read in database for messages from other users."""
        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.notify.send_push_notification"):

            db = TestingSessionLocal()
            try:
                # Create a message from the OTHER user (user2 sends to user1)
                message = Message(
                    chat_room_id=test_room.id,
                    sender_id=test_user2.id,  # Message from user2
                    content="Unread message from user2",
                    message_type="TEXT",
                    is_read=False,
                )
                db.add(message)
                db.commit()
                message_id = message.id

                with client.websocket_connect(f"/ws/chat/{test_room.id}?token={user1_token}") as websocket:
                    # User1 sends read receipt (marks messages from others as read)
                    websocket.send_json({"type": "read"})

                    # Wait for processing
                    time.sleep(0.2)

                # Close the current session and open a fresh one to see the updated data
                db.close()
                db = TestingSessionLocal()

                # Verify is_read updated (message from user2 is now read by user1)
                updated_message = db.query(Message).filter(Message.id == message_id).first()
                assert updated_message is not None
                assert updated_message.is_read is True
            finally:
                db.close()
                self.cleanup_manager()

    def test_typing_indicator(self, client: TestClient, test_room, user1_token, test_user):
        """Test typing indicator is processed without error."""
        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.notify.send_push_notification"):

            try:
                with client.websocket_connect(f"/ws/chat/{test_room.id}?token={user1_token}") as websocket:
                    # Send typing indicator
                    websocket.send_json({"type": "typing"})

                    # Wait a bit
                    time.sleep(0.1)

                    # Send a regular message to confirm connection is alive
                    websocket.send_json({
                        "type": "text",
                        "content": "Still connected"
                    })

                    response = websocket.receive_json()
                    assert response["type"] == "message"
                    assert response["data"]["content"] == "Still connected"
            finally:
                self.cleanup_manager()

    def test_pong_response(self, client: TestClient, test_room, user1_token, test_user):
        """Test that pong message is processed without error."""
        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.notify.send_push_notification"):

            try:
                with client.websocket_connect(f"/ws/chat/{test_room.id}?token={user1_token}") as websocket:
                    # Send pong (heartbeat response)
                    websocket.send_json({"type": "pong"})

                    # Wait a bit
                    time.sleep(0.1)

                    # Send a regular message to confirm connection is alive
                    websocket.send_json({
                        "type": "text",
                        "content": "After pong"
                    })

                    response = websocket.receive_json()
                    assert response["type"] == "message"
                    assert response["data"]["content"] == "After pong"
            finally:
                self.cleanup_manager()
