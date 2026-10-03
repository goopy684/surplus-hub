"""
Unit tests for ConnectionManager class.

Tests cover connection tracking, connection limits, broadcasting,
online status checking, and heartbeat functionality.
"""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.ws_manager import (
    ConnectionManager,
    HEARTBEAT_INTERVAL,
    HEARTBEAT_TIMEOUT,
    MAX_CONNECTIONS_PER_USER,
    MAX_TOTAL_CONNECTIONS,
)


def create_mock_ws():
    """Create a mock WebSocket for testing."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    ws.close = AsyncMock()
    ws.send_json = AsyncMock()
    return ws


class TestConnectionTracking:
    """Tests for basic connection tracking functionality."""

    @pytest.mark.asyncio
    async def test_connect_adds_to_active_connections(self):
        """Test that connect() adds WebSocket to active_connections."""
        manager = ConnectionManager()
        ws = create_mock_ws()
        room_id = 1
        user_id = 100

        await manager.connect(ws, room_id, user_id)

        assert room_id in manager.active_connections
        assert ws in manager.active_connections[room_id]
        assert ws.accept.called

        # Cleanup
        manager.disconnect(ws, room_id)

    @pytest.mark.asyncio
    async def test_connect_maps_user(self):
        """Test that connect() maps WebSocket to user_id."""
        manager = ConnectionManager()
        ws = create_mock_ws()
        room_id = 1
        user_id = 100

        await manager.connect(ws, room_id, user_id)

        assert ws in manager.connection_user_map
        assert manager.connection_user_map[ws] == user_id

        # Cleanup
        manager.disconnect(ws, room_id)

    @pytest.mark.asyncio
    async def test_connect_increments_counters(self):
        """Test that connect() increments user and total connection counters."""
        manager = ConnectionManager()
        ws = create_mock_ws()
        room_id = 1
        user_id = 100

        initial_total = manager._total_connections
        initial_user_count = manager._user_connection_count[user_id]

        await manager.connect(ws, room_id, user_id)

        assert manager._total_connections == initial_total + 1
        assert manager._user_connection_count[user_id] == initial_user_count + 1

        # Cleanup
        manager.disconnect(ws, room_id)

    def test_disconnect_removes_connection(self):
        """Test that disconnect() removes WebSocket from active_connections."""
        manager = ConnectionManager()
        ws = create_mock_ws()
        room_id = 1
        user_id = 100

        # Manually setup connection to avoid async
        manager.active_connections[room_id] = {ws}
        manager.connection_user_map[ws] = user_id
        manager._user_connection_count[user_id] = 1
        manager._total_connections = 1

        manager.disconnect(ws, room_id)

        assert ws not in manager.active_connections.get(room_id, set())

    def test_disconnect_cleans_user_map(self):
        """Test that disconnect() removes WebSocket from connection_user_map."""
        manager = ConnectionManager()
        ws = create_mock_ws()
        room_id = 1
        user_id = 100

        # Manually setup connection
        manager.active_connections[room_id] = {ws}
        manager.connection_user_map[ws] = user_id
        manager._user_connection_count[user_id] = 1
        manager._total_connections = 1

        manager.disconnect(ws, room_id)

        assert ws not in manager.connection_user_map

    def test_disconnect_decrements_counters(self):
        """Test that disconnect() decrements user and total connection counters."""
        manager = ConnectionManager()
        ws = create_mock_ws()
        room_id = 1
        user_id = 100

        # Manually setup connection
        manager.active_connections[room_id] = {ws}
        manager.connection_user_map[ws] = user_id
        manager._user_connection_count[user_id] = 2
        manager._total_connections = 5

        manager.disconnect(ws, room_id)

        assert manager._user_connection_count[user_id] == 1
        assert manager._total_connections == 4

    def test_disconnect_removes_empty_room(self):
        """Test that disconnect() removes room_id key when last connection is removed."""
        manager = ConnectionManager()
        ws = create_mock_ws()
        room_id = 1
        user_id = 100

        # Manually setup connection (single connection in room)
        manager.active_connections[room_id] = {ws}
        manager.connection_user_map[ws] = user_id
        manager._user_connection_count[user_id] = 1
        manager._total_connections = 1

        manager.disconnect(ws, room_id)

        # Room should be completely removed
        assert room_id not in manager.active_connections


class TestConnectionLimits:
    """Tests for connection limit enforcement."""

    @pytest.mark.asyncio
    async def test_max_connections_per_user(self):
        """Test that connections exceeding MAX_CONNECTIONS_PER_USER are rejected with 4029."""
        manager = ConnectionManager()
        user_id = 100
        room_id = 1

        # Connect up to the limit
        connections = []
        for i in range(MAX_CONNECTIONS_PER_USER):
            ws = create_mock_ws()
            await manager.connect(ws, room_id, user_id)
            connections.append(ws)

        # Try to exceed the limit
        ws_excess = create_mock_ws()
        await manager.connect(ws_excess, room_id, user_id)

        # Verify the excess connection was rejected
        ws_excess.accept.assert_called_once()
        ws_excess.close.assert_called_once_with(code=4029, reason="Too many connections")

        # Cleanup
        for ws in connections:
            manager.disconnect(ws, room_id)

    @pytest.mark.asyncio
    async def test_max_total_connections(self):
        """Test that connections exceeding MAX_TOTAL_CONNECTIONS are rejected with 4029."""
        manager = ConnectionManager()
        room_id = 1

        # Manually set total connections to the limit
        manager._total_connections = MAX_TOTAL_CONNECTIONS

        # Try to add one more connection
        ws = create_mock_ws()
        user_id = 100
        await manager.connect(ws, room_id, user_id)

        # Verify connection was rejected
        ws.accept.assert_called_once()
        ws.close.assert_called_once_with(code=4029, reason="Too many connections")

        # Connection should not be added
        assert ws not in manager.connection_user_map


class TestBroadcast:
    """Tests for broadcasting and personal messaging."""

    @pytest.mark.asyncio
    async def test_broadcast_to_room_sends_to_all(self):
        """Test that broadcast_to_room() sends message to all connections in room."""
        manager = ConnectionManager()
        room_id = 1
        user_id = 100
        message = {"type": "test", "data": "hello"}

        # Create multiple connections
        ws1 = create_mock_ws()
        ws2 = create_mock_ws()
        ws3 = create_mock_ws()

        await manager.connect(ws1, room_id, user_id)
        await manager.connect(ws2, room_id, user_id + 1)
        await manager.connect(ws3, room_id, user_id + 2)

        await manager.broadcast_to_room(room_id, message)

        # All connections should receive the message
        ws1.send_json.assert_called_once_with(message)
        ws2.send_json.assert_called_once_with(message)
        ws3.send_json.assert_called_once_with(message)

        # Cleanup
        manager.disconnect(ws1, room_id)
        manager.disconnect(ws2, room_id)
        manager.disconnect(ws3, room_id)

    @pytest.mark.asyncio
    async def test_broadcast_excludes_sender(self):
        """Test that broadcast_to_room() excludes specified connection."""
        manager = ConnectionManager()
        room_id = 1

        ws1 = create_mock_ws()
        ws2 = create_mock_ws()
        ws3 = create_mock_ws()

        await manager.connect(ws1, room_id, 100)
        await manager.connect(ws2, room_id, 101)
        await manager.connect(ws3, room_id, 102)

        message = {"type": "test", "data": "hello"}
        await manager.broadcast_to_room(room_id, message, exclude=ws2)

        # ws1 and ws3 should receive, but not ws2
        ws1.send_json.assert_called_once_with(message)
        ws2.send_json.assert_not_called()
        ws3.send_json.assert_called_once_with(message)

        # Cleanup
        manager.disconnect(ws1, room_id)
        manager.disconnect(ws2, room_id)
        manager.disconnect(ws3, room_id)

    @pytest.mark.asyncio
    async def test_broadcast_to_empty_room(self):
        """Test that broadcast_to_room() handles empty room without error."""
        manager = ConnectionManager()
        room_id = 999  # Non-existent room
        message = {"type": "test"}

        # Should not raise any exception
        await manager.broadcast_to_room(room_id, message)

    @pytest.mark.asyncio
    async def test_send_personal(self):
        """Test that send_personal() sends message to specific connection."""
        manager = ConnectionManager()
        room_id = 1

        ws1 = create_mock_ws()
        ws2 = create_mock_ws()

        await manager.connect(ws1, room_id, 100)
        await manager.connect(ws2, room_id, 101)

        message = {"type": "personal", "data": "hello"}
        await manager.send_personal(ws1, message)

        # Only ws1 should receive
        ws1.send_json.assert_called_once_with(message)
        ws2.send_json.assert_not_called()

        # Cleanup
        manager.disconnect(ws1, room_id)
        manager.disconnect(ws2, room_id)


class TestOnlineStatus:
    """Tests for online status checking."""

    @pytest.mark.asyncio
    async def test_is_user_online_in_room_true(self):
        """Test that is_user_online_in_room() returns True for connected user."""
        manager = ConnectionManager()
        room_id = 1
        user_id = 100

        ws = create_mock_ws()
        await manager.connect(ws, room_id, user_id)

        assert manager.is_user_online_in_room(room_id, user_id) is True

        # Cleanup
        manager.disconnect(ws, room_id)

    @pytest.mark.asyncio
    async def test_is_user_online_in_room_false(self):
        """Test that is_user_online_in_room() returns False for disconnected user."""
        manager = ConnectionManager()
        room_id = 1
        user_id = 100

        # User never connected
        assert manager.is_user_online_in_room(room_id, user_id) is False

        # User connected to different room
        ws = create_mock_ws()
        await manager.connect(ws, room_id=2, user_id=user_id)
        assert manager.is_user_online_in_room(room_id, user_id) is False

        # Cleanup
        manager.disconnect(ws, room_id=2)

    @pytest.mark.asyncio
    async def test_get_online_user_ids(self):
        """Test that get_online_user_ids() returns set of online user IDs."""
        manager = ConnectionManager()
        room_id = 1

        ws1 = create_mock_ws()
        ws2 = create_mock_ws()
        ws3 = create_mock_ws()

        await manager.connect(ws1, room_id, 100)
        await manager.connect(ws2, room_id, 101)
        await manager.connect(ws3, room_id, 102)

        online_users = manager.get_online_user_ids(room_id)

        assert online_users == {100, 101, 102}

        # Test empty room
        empty_room_users = manager.get_online_user_ids(room_id=999)
        assert empty_room_users == set()

        # Cleanup
        manager.disconnect(ws1, room_id)
        manager.disconnect(ws2, room_id)
        manager.disconnect(ws3, room_id)


class TestHeartbeat:
    """Tests for heartbeat functionality."""

    def test_record_pong_updates_timestamp(self):
        """Test that record_pong() updates _last_pong timestamp."""
        manager = ConnectionManager()
        ws = create_mock_ws()

        # Set initial timestamp relative to the monotonic clock: record_pong()
        # stores time.monotonic(), which starts near 0 on freshly booted
        # machines (e.g. CI runners), so a fixed 1000.0 baseline can be in the
        # future there.
        initial_time = time.monotonic() - 100.0
        manager._last_pong[ws] = initial_time

        # Wait a bit and record pong
        time.sleep(0.01)
        manager.record_pong(ws)

        # Timestamp should be updated
        assert manager._last_pong[ws] > initial_time

    @pytest.mark.asyncio
    async def test_heartbeat_starts_on_connect(self):
        """Test that connect() starts a heartbeat task."""
        manager = ConnectionManager()
        ws = create_mock_ws()
        room_id = 1
        user_id = 100

        await manager.connect(ws, room_id, user_id)

        # Heartbeat task should be created
        assert ws in manager._heartbeat_tasks
        assert isinstance(manager._heartbeat_tasks[ws], asyncio.Task)
        assert not manager._heartbeat_tasks[ws].done()

        # Cleanup
        manager.disconnect(ws, room_id)
        # Wait a bit for task cancellation
        await asyncio.sleep(0.1)
