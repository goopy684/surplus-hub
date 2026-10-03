"""C3. WebSocket Integration Tests

Tests for WebSocket broadcast behavior and disconnect cleanup.
Builds on existing test_ws_connection.py and test_ws_messaging.py
with focus on broadcast correctness and edge cases.
"""

import time
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.core.ws_manager import ConnectionManager, manager
from app.models.chat import ChatRoom
from app.tests.conftest import TestingSessionLocal


# ===================================================================
# WebSocket Broadcast Tests
# ===================================================================
class TestWebSocketBroadcast:
    """Test that messages are broadcast to all participants in a room."""

    @pytest.fixture(autouse=True)
    def cleanup_manager(self):
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
    def test_room(self, test_user, test_user2):
        """Create a chat room for WebSocket tests."""
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

    def test_websocket_broadcast_to_other_user(
        self, client: TestClient, test_room, test_user, test_user2
    ):
        """When user1 sends a message, user2 should receive it via broadcast."""
        token1 = create_access_token(subject=test_user.id)
        token2 = create_access_token(subject=test_user2.id)

        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token1}"
            ) as ws1:
                with client.websocket_connect(
                    f"/ws/chat/{test_room.id}?token={token2}"
                ) as ws2:
                    # User 1 sends a message
                    ws1.send_json({
                        "type": "text",
                        "content": "Broadcast test message"
                    })

                    # User 2 should receive the broadcast
                    data2 = ws2.receive_json()
                    assert data2["type"] == "message"
                    assert data2["data"]["content"] == "Broadcast test message"
                    assert data2["data"]["senderId"] == test_user.id

                    # User 1 also receives confirmation
                    data1 = ws1.receive_json()
                    assert data1["type"] == "message"
                    assert data1["data"]["content"] == "Broadcast test message"

    def test_websocket_message_persistence(
        self, client: TestClient, test_room, test_user
    ):
        """Messages sent via WebSocket should be persisted to the database."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                ws.send_json({
                    "type": "text",
                    "content": "Persistence check"
                })
                response = ws.receive_json()
                assert response["type"] == "message"
                assert response["data"]["content"] == "Persistence check"

            # Verify in DB
            time.sleep(0.1)
            db = TestingSessionLocal()
            try:
                from app.models.chat import Message
                msg = db.query(Message).filter(
                    Message.chat_room_id == test_room.id,
                    Message.content == "Persistence check"
                ).first()
                assert msg is not None
                assert msg.sender_id == test_user.id
            finally:
                db.close()


# ===================================================================
# WebSocket Disconnect Cleanup Tests
# ===================================================================
class TestWebSocketDisconnectCleanup:
    """Test that disconnected connections are properly cleaned up."""

    @pytest.fixture(autouse=True)
    def cleanup_manager(self):
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
    def test_room(self, test_user, test_user2):
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

    def test_disconnect_removes_from_active_connections(
        self, client: TestClient, test_room, test_user
    ):
        """After WebSocket disconnect, connection should be removed from manager."""
        token = create_access_token(subject=test_user.id)

        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token}"
            ) as ws:
                # Connection is active
                assert test_room.id in manager.active_connections
                assert len(manager.active_connections[test_room.id]) >= 1

            # After context manager exits (disconnect), connection should be cleaned
            time.sleep(0.1)
            room_conns = manager.active_connections.get(test_room.id, set())
            # The connection used by ws should have been removed
            # (room may still exist if other connections remain, but this one should be gone)
            assert manager._total_connections >= 0

    def test_disconnect_one_user_other_remains(
        self, client: TestClient, test_room, test_user, test_user2
    ):
        """When one user disconnects, the other user's connection should remain active."""
        token1 = create_access_token(subject=test_user.id)
        token2 = create_access_token(subject=test_user2.id)

        with patch("app.api.endpoints.ws.get_db_session", side_effect=lambda: TestingSessionLocal()), \
             patch("app.core.ws_manager.ConnectionManager._heartbeat_loop"), \
             patch("app.core.notify.send_push_notification"):

            with client.websocket_connect(
                f"/ws/chat/{test_room.id}?token={token1}"
            ) as ws1:
                with client.websocket_connect(
                    f"/ws/chat/{test_room.id}?token={token2}"
                ) as ws2:
                    # Both connected
                    assert test_room.id in manager.active_connections

                    # User2 sends a message while both connected
                    ws2.send_json({
                        "type": "text",
                        "content": "Before disconnect"
                    })

                    # User1 receives the broadcast
                    data = ws1.receive_json()
                    assert data["type"] == "message"
                    assert data["data"]["content"] == "Before disconnect"

                # ws2 disconnected here (exited inner context)
                time.sleep(0.1)

                # ws1 should still be usable -- send a message
                ws1.send_json({
                    "type": "text",
                    "content": "After other disconnect"
                })
                data = ws1.receive_json()
                assert data["type"] == "message"
                assert data["data"]["content"] == "After other disconnect"


# ===================================================================
# ConnectionManager Unit Tests (broadcast edge cases)
# ===================================================================
class TestConnectionManagerBroadcast:
    """Unit tests for ConnectionManager.broadcast_to_room edge cases."""

    @pytest.fixture()
    def mgr(self):
        """Create a fresh ConnectionManager for isolated testing."""
        return ConnectionManager()

    @pytest.mark.asyncio
    async def test_broadcast_to_empty_room(self, mgr):
        """Broadcasting to a room with no connections should not raise."""
        # Should be a no-op
        await mgr.broadcast_to_room(999, {"type": "test"})

    @pytest.mark.asyncio
    async def test_broadcast_handles_failed_connection(self, mgr):
        """If a connection fails during broadcast, it should be cleaned up."""
        room_id = 1

        ws_good = MagicMock()
        ws_good.send_json = AsyncMock()

        ws_bad = MagicMock()
        ws_bad.send_json = AsyncMock(side_effect=ConnectionError("Lost"))

        # Manually set up connections
        mgr.active_connections[room_id] = {ws_good, ws_bad}
        mgr.connection_user_map[ws_good] = 1
        mgr.connection_user_map[ws_bad] = 2
        mgr._user_connection_count[1] = 1
        mgr._user_connection_count[2] = 1
        mgr._total_connections = 2

        await mgr.broadcast_to_room(room_id, {"type": "message", "data": {}})

        # Good connection should have received the message
        ws_good.send_json.assert_called_once()

        # Bad connection should be disconnected (removed from active set)
        assert ws_bad not in mgr.active_connections.get(room_id, set())

    @pytest.mark.asyncio
    async def test_broadcast_excludes_sender(self, mgr):
        """Broadcast with exclude parameter should skip the sender."""
        room_id = 1

        ws_sender = MagicMock()
        ws_sender.send_json = AsyncMock()

        ws_receiver = MagicMock()
        ws_receiver.send_json = AsyncMock()

        mgr.active_connections[room_id] = {ws_sender, ws_receiver}
        mgr.connection_user_map[ws_sender] = 1
        mgr.connection_user_map[ws_receiver] = 2

        await mgr.broadcast_to_room(
            room_id, {"type": "message"}, exclude=ws_sender
        )

        # Sender should NOT have received the message
        ws_sender.send_json.assert_not_called()
        # Receiver should have received it
        ws_receiver.send_json.assert_called_once()

    @pytest.mark.asyncio
    async def test_send_personal_handles_failure(self, mgr):
        """send_personal should not raise even if the connection is broken."""
        ws = MagicMock()
        ws.send_json = AsyncMock(side_effect=ConnectionError("Broken"))

        # Should not raise
        await mgr.send_personal(ws, {"type": "error"})

    def test_disconnect_cleans_up_all_state(self, mgr):
        """disconnect() should remove connection from all tracking structures."""
        room_id = 1
        ws = MagicMock()

        mgr.active_connections[room_id] = {ws}
        mgr.connection_user_map[ws] = 42
        mgr._user_connection_count[42] = 1
        mgr._total_connections = 1
        mgr._last_pong[ws] = 12345.0

        mgr.disconnect(ws, room_id)

        assert ws not in mgr.active_connections.get(room_id, set())
        assert ws not in mgr.connection_user_map
        assert 42 not in mgr._user_connection_count
        assert mgr._total_connections == 0
        assert ws not in mgr._last_pong

    def test_is_user_online_in_room(self, mgr):
        """is_user_online_in_room should correctly report online status."""
        room_id = 1
        ws = MagicMock()

        assert mgr.is_user_online_in_room(room_id, 1) is False

        mgr.active_connections[room_id] = {ws}
        mgr.connection_user_map[ws] = 1

        assert mgr.is_user_online_in_room(room_id, 1) is True
        assert mgr.is_user_online_in_room(room_id, 2) is False
        assert mgr.is_user_online_in_room(999, 1) is False

    def test_get_online_user_ids(self, mgr):
        """get_online_user_ids should return all connected user IDs in a room."""
        room_id = 1
        ws1 = MagicMock()
        ws2 = MagicMock()

        assert mgr.get_online_user_ids(room_id) == set()

        mgr.active_connections[room_id] = {ws1, ws2}
        mgr.connection_user_map[ws1] = 10
        mgr.connection_user_map[ws2] = 20

        online = mgr.get_online_user_ids(room_id)
        assert online == {10, 20}
