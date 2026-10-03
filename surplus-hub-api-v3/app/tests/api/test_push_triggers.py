"""
Push-notification TRIGGER sites — regression guards for two demonstrated defects.

T1 — ws.py must hand notify() to a worker thread (asyncio.to_thread) instead of
     blocking the event loop on the push HTTP call, and it must still finish
     before the manually-opened session is closed.
T2 — completing a transaction flips the material to SOLD, so the users who liked
     it have to be notified on that path too, not only on the manual status PATCH.

Everything is mocked — no test in this file may reach the network.
"""
import asyncio
import itertools
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core import notify as notify_mod
from app.core import push as push_mod
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.chat import ChatRoom
from app.models.like import MaterialLike
from app.models.notification import Notification
from app.models.user import User
from app.tests.conftest import TestingSessionLocal

MAT_PREFIX = f"{settings.API_V1_STR}/materials"
TX_PREFIX = f"{settings.API_V1_STR}/transactions"

_seq = itertools.count()


@pytest.fixture(autouse=True)
def _no_network():
    """Both bindings are patched: notify.py imported the name, push.py owns it."""
    stub = {"success": 1, "failure": 0, "invalid_tokens": []}
    with patch.object(notify_mod, "send_push_notification", return_value=stub), \
         patch.object(push_mod, "send_push_notification", return_value=stub):
        yield


def _make_user(db) -> User:
    n = next(_seq)
    user = User(
        email=f"trigger{n}@example.com",
        hashed_password=get_password_hash("password123"),
        name=f"Trigger {n}",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_material(client: TestClient, auth_headers: dict) -> int:
    resp = client.post(
        f"{MAT_PREFIX}/",
        json={
            "title": "관심 자재",
            "description": "트리거 테스트용",
            "price": 30000,
            "location": {"address": "Seoul"},
            "quantity": 1,
            "quantityUnit": "ea",
            "tradeMethod": "DIRECT",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["id"]


def _status_notifications(db, material_id: int):
    return (
        db.query(Notification)
        .filter(
            Notification.type == "MATERIAL_STATUS",
            Notification.reference_id == material_id,
        )
        .order_by(Notification.id)
        .all()
    )


def _cleanup_manager():
    from app.core.ws_manager import manager
    manager.active_connections.clear()
    manager.connection_user_map.clear()
    manager._user_connection_count.clear()
    manager._total_connections = 0
    for task in list(manager._heartbeat_tasks.values()):
        if not task.done():
            task.cancel()
    manager._heartbeat_tasks.clear()
    manager._last_pong.clear()


# ---------------------------------------------------------------------------
# T2 — the liked-material fan-out must live where every caller routes through
# ---------------------------------------------------------------------------
class TestLikedMaterialFanOut:
    def test_transaction_completion_notifies_likers(
        self, client: TestClient, auth_headers, auth_headers2, test_user, db
    ):
        """The path that actually sells the material must notify its likers."""
        material_id = _create_material(client, auth_headers)
        liker = _make_user(db)
        db.add(MaterialLike(user_id=liker.id, material_id=material_id))
        db.add(MaterialLike(user_id=test_user.id, material_id=material_id))  # seller
        db.commit()

        create = client.post(
            f"{TX_PREFIX}/", json={"materialId": material_id}, headers=auth_headers2
        )
        assert create.status_code == 200, create.text
        tx_id = create.json()["data"]["id"]
        assert client.patch(f"{TX_PREFIX}/{tx_id}/confirm", headers=auth_headers).status_code == 200
        assert client.patch(f"{TX_PREFIX}/{tx_id}/complete", headers=auth_headers2).status_code == 200

        rows = _status_notifications(db, material_id)
        assert [r.user_id for r in rows] == [liker.id]  # seller excluded from own likers
        assert rows[0].reference_type == "material"
        assert "판매 완료" in rows[0].body

    def test_status_patch_still_notifies_likers(
        self, client: TestClient, auth_headers, test_user, db
    ):
        """Moving the fan-out must not lose the endpoint that already had it."""
        material_id = _create_material(client, auth_headers)
        liker = _make_user(db)
        db.add(MaterialLike(user_id=liker.id, material_id=material_id))
        db.commit()

        resp = client.patch(
            f"{MAT_PREFIX}/{material_id}/status", json={"status": "RESERVED"}, headers=auth_headers
        )
        assert resp.status_code == 200, resp.text

        rows = _status_notifications(db, material_id)
        assert [r.user_id for r in rows] == [liker.id]
        assert "예약 중" in rows[0].body

    def test_active_status_notifies_nobody(
        self, client: TestClient, auth_headers, db
    ):
        material_id = _create_material(client, auth_headers)
        liker = _make_user(db)
        db.add(MaterialLike(user_id=liker.id, material_id=material_id))
        db.commit()

        resp = client.patch(
            f"{MAT_PREFIX}/{material_id}/status", json={"status": "HIDDEN"}, headers=auth_headers
        )
        assert resp.status_code == 200, resp.text
        assert _status_notifications(db, material_id) == []


# ---------------------------------------------------------------------------
# T1 — ws.py must not block the event loop on the push HTTP call
# ---------------------------------------------------------------------------
class TestWSNotifyOffEventLoop:
    @pytest.fixture()
    def room(self, test_user, test_user2):
        db = TestingSessionLocal()
        try:
            room = ChatRoom(buyer_id=test_user.id, seller_id=test_user2.id)
            db.add(room)
            db.commit()
            db.refresh(room)
            return room
        finally:
            db.close()

    @pytest.mark.parametrize(
        "payload",
        [
            {"type": "text", "content": "안녕하세요"},
            {"type": "location", "content": {"latitude": 37.5, "longitude": 127.0, "address": "서울"}},
        ],
        ids=["text", "location"],
    )
    def test_notify_runs_off_the_loop_and_before_the_session_closes(
        self, client: TestClient, test_user, room, payload
    ):
        events = []

        def _session_factory():
            session = TestingSessionLocal()
            real_close = session.close

            def close():
                events.append("close")
                real_close()

            session.close = close
            return session

        def _notify_stub(db, **kwargs):
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                events.append("notify")  # off the event loop, as required
            else:
                events.append("notify-blocked-the-event-loop")
            return None

        token = create_access_token(subject=test_user.id)
        with patch("app.api.endpoints.ws.get_db_session", side_effect=_session_factory), \
             patch("app.api.endpoints.ws.authenticate_ws_token", return_value=test_user.id), \
             patch("app.api.endpoints.ws.notify", side_effect=_notify_stub):
            try:
                with client.websocket_connect(f"/ws/chat/{room.id}?token={token}") as ws:
                    ws.send_json(payload)
                    assert ws.receive_json()["type"] == "message"
            finally:
                _cleanup_manager()

        # notify() ran in a worker thread, and the session it was handed was
        # still open at that moment — it is closed immediately afterwards.
        assert events[-2:] == ["notify", "close"]
