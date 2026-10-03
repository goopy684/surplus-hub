"""
Admin push broadcast API: POST /admin/notifications/push, GET /stats, GET /history.

Everything is mocked — no test in this file may reach the network.
"""
import itertools
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core import notify as notify_mod
from app.core import push as push_mod
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.admin import AdminAuditLog
from app.models.notification import DeviceToken
from app.models.user import User

PREFIX = f"{settings.API_V1_STR}/admin/notifications"

_seq = itertools.count()

_VALID_BODY = {"title": "공지", "body": "본문", "target": "all"}


@pytest.fixture(autouse=True)
def _no_network():
    """Both bindings are patched: notify.py imported the name, push.py owns it."""
    stub = {"success": 1, "failure": 0, "invalid_tokens": []}
    with patch.object(notify_mod, "send_push_notification", return_value=stub), \
         patch.object(push_mod, "send_push_notification", return_value=stub):
        yield


def _make_user(db, **kwargs) -> User:
    n = next(_seq)
    user = User(
        email=f"adminpush{n}@example.com",
        hashed_password=get_password_hash("password123"),
        name=f"Admin Push {n}",
        **{"is_active": True, **kwargs},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _count_broadcasts(db) -> int:
    return db.query(AdminAuditLog).filter(AdminAuditLog.action == "PUSH_BROADCAST").count()


def _latest_broadcast(db) -> AdminAuditLog:
    return (
        db.query(AdminAuditLog)
        .filter(AdminAuditLog.action == "PUSH_BROADCAST")
        .order_by(AdminAuditLog.id.desc())
        .first()
    )


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------
class TestAuthorization:
    def test_push_requires_auth(self, client: TestClient):
        assert client.post(f"{PREFIX}/push", json=_VALID_BODY).status_code == 401

    def test_stats_requires_auth(self, client: TestClient):
        assert client.get(f"{PREFIX}/stats").status_code == 401

    def test_history_requires_auth(self, client: TestClient):
        assert client.get(f"{PREFIX}/history").status_code == 401

    def test_push_rejects_regular_user(self, client: TestClient, auth_headers: dict):
        resp = client.post(f"{PREFIX}/push", json=_VALID_BODY, headers=auth_headers)
        assert resp.status_code == 403

    def test_stats_rejects_regular_user(self, client: TestClient, auth_headers: dict):
        assert client.get(f"{PREFIX}/stats", headers=auth_headers).status_code == 403

    def test_history_rejects_regular_user(self, client: TestClient, auth_headers: dict):
        assert client.get(f"{PREFIX}/history", headers=auth_headers).status_code == 403

    def test_push_rejects_moderator(self, client: TestClient, moderator_headers: dict):
        """Broadcasting is ADMIN+, unlike /stats and /history."""
        resp = client.post(f"{PREFIX}/push", json=_VALID_BODY, headers=moderator_headers)
        assert resp.status_code == 403

    def test_stats_allows_moderator(self, client: TestClient, moderator_headers: dict):
        assert client.get(f"{PREFIX}/stats", headers=moderator_headers).status_code == 200


# ---------------------------------------------------------------------------
# POST /push — recipient resolution
# ---------------------------------------------------------------------------
class TestBroadcastTargets:
    def test_target_all_hits_every_active_user(
        self, client: TestClient, admin_headers: dict, db
    ):
        _make_user(db)
        _make_user(db, is_active=False)
        expected = db.query(User).filter(User.is_active == True).count()  # noqa: E712

        resp = client.post(
            f"{PREFIX}/push",
            json={"title": "전체 공지", "body": "모두에게", "target": "all"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["targeted"] == expected
        assert data["created"] == expected
        assert set(data) == {"targeted", "created", "pushed", "failed", "skipped"}

    def test_target_users_counts_only_existing_ids(
        self, client: TestClient, admin_headers: dict, db
    ):
        a, b = _make_user(db), _make_user(db)

        resp = client.post(
            f"{PREFIX}/push",
            json={
                "title": "지정 발송",
                "body": "두 명에게",
                "target": "users",
                "userIds": [a.id, b.id, 99999999],
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["targeted"] == 2
        assert data["created"] == 2

    def test_target_users_ignores_inactive(
        self, client: TestClient, admin_headers: dict, db
    ):
        active = _make_user(db)
        inactive = _make_user(db, is_active=False)

        resp = client.post(
            f"{PREFIX}/push",
            json={
                "title": "지정 발송",
                "body": "활성만",
                "target": "users",
                "userIds": [active.id, inactive.id],
            },
            headers=admin_headers,
        )
        assert resp.json()["data"]["targeted"] == 1

    def test_target_role_matches_case_insensitively(
        self, client: TestClient, admin_headers: dict, db
    ):
        _make_user(db, role="pushrole")

        resp = client.post(
            f"{PREFIX}/push",
            json={"title": "역할 발송", "body": "역할 대상", "target": "role", "role": "PUSHROLE"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"]["targeted"] == 1

    def test_target_role_matching_nobody_is_success_with_zero(
        self, client: TestClient, admin_headers: dict, db
    ):
        before = _count_broadcasts(db)

        resp = client.post(
            f"{PREFIX}/push",
            json={"title": "빈 발송", "body": "대상 없음", "target": "role", "role": "no_such_role_zzz"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["data"] == {
            "targeted": 0, "created": 0, "pushed": 0, "failed": 0, "skipped": 0
        }
        # An attempted broadcast is still audited.
        assert _count_broadcasts(db) == before + 1


# ---------------------------------------------------------------------------
# POST /push — validation
# ---------------------------------------------------------------------------
class TestBroadcastValidation:
    @pytest.mark.parametrize(
        "payload",
        [
            {"title": "   ", "body": "본문", "target": "all"},
            {"title": "제목", "target": "all"},
            {"title": "제목", "body": "   ", "target": "all"},
            {"title": "ㄱ" * 101, "body": "본문", "target": "all"},
            {"title": "제목", "body": "ㄴ" * 501, "target": "all"},
            {"title": "제목", "body": "본문", "target": "users", "userIds": []},
            {"title": "제목", "body": "본문", "target": "users"},
            {"title": "제목", "body": "본문", "target": "role"},
            {"title": "제목", "body": "본문", "target": "role", "role": "  "},
            {"title": "제목", "body": "본문", "target": "everyone"},
            {"title": "제목", "body": "본문", "target": "all", "type": "PROMO"},
        ],
    )
    def test_invalid_payload_is_422(self, client: TestClient, admin_headers: dict, payload):
        resp = client.post(f"{PREFIX}/push", json=payload, headers=admin_headers)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /push — audit trail
# ---------------------------------------------------------------------------
class TestBroadcastAudit:
    def test_writes_exactly_one_row_with_korean_details(
        self, client: TestClient, admin_headers: dict, test_admin, db
    ):
        target = _make_user(db)
        before = _count_broadcasts(db)

        resp = client.post(
            f"{PREFIX}/push",
            json={
                "title": "긴급 공지 📢",
                "body": "서버 점검 안내입니다.",
                "target": "users",
                "userIds": [target.id],
                "type": "MARKETING",
            },
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert _count_broadcasts(db) == before + 1

        log = _latest_broadcast(db)
        assert log.admin_id == test_admin.id
        assert log.target_type == "notification"
        assert log.target_id is None
        # ensure_ascii=False: Korean survives verbatim in the stored JSON.
        assert "긴급 공지" in log.details
        details = json.loads(log.details)
        assert details["title"] == "긴급 공지 📢"
        assert details["body"] == "서버 점검 안내입니다."
        assert details["target"] == "users"
        assert details["type"] == "MARKETING"
        assert details["targeted"] == 1
        assert details["created"] == resp.json()["data"]["created"]


# ---------------------------------------------------------------------------
# GET /stats
# ---------------------------------------------------------------------------
class TestStats:
    def test_counts_tokens_per_platform(
        self, client: TestClient, moderator_headers: dict, db
    ):
        base = client.get(f"{PREFIX}/stats", headers=moderator_headers).json()["data"]
        assert base["deviceTokens"]["web"] == 0  # no web tokens exist yet

        user = _make_user(db)
        for token, platform, is_active in [
            ("stats-ios-1", "ios", True),
            ("stats-ios-2", "ios", True),
            ("stats-android-1", "android", True),
            ("ExponentPushToken[stats-1]", "expo", True),
            ("stats-ios-dead", "ios", False),
        ]:
            db.add(DeviceToken(user_id=user.id, token=token, platform=platform, is_active=is_active))
        db.commit()

        resp = client.get(f"{PREFIX}/stats", headers=moderator_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        tokens = data["deviceTokens"]

        assert all(isinstance(v, int) for v in tokens.values())
        assert isinstance(data["totalNotifications"], int)
        assert isinstance(data["unreadNotifications"], int)
        assert isinstance(data["sentLast7Days"], int)

        assert tokens["ios"] == base["deviceTokens"]["ios"] + 2  # inactive one excluded
        assert tokens["android"] == base["deviceTokens"]["android"] + 1
        assert tokens["expo"] == base["deviceTokens"]["expo"] + 1
        assert tokens["web"] == 0  # absent platform reports 0, not omitted
        assert tokens["total"] == base["deviceTokens"]["total"] + 5  # total ignores is_active
        assert tokens["active"] == base["deviceTokens"]["active"] + 4

    def test_notification_counts_grow_with_a_broadcast(
        self, client: TestClient, admin_headers: dict, moderator_headers: dict, db
    ):
        base = client.get(f"{PREFIX}/stats", headers=moderator_headers).json()["data"]
        target = _make_user(db)

        client.post(
            f"{PREFIX}/push",
            json={"title": "통계 확인", "body": "카운트", "target": "users", "userIds": [target.id]},
            headers=admin_headers,
        )

        data = client.get(f"{PREFIX}/stats", headers=moderator_headers).json()["data"]
        assert data["totalNotifications"] == base["totalNotifications"] + 1
        assert data["unreadNotifications"] == base["unreadNotifications"] + 1
        assert data["sentLast7Days"] == base["sentLast7Days"] + 1


# ---------------------------------------------------------------------------
# GET /history
# ---------------------------------------------------------------------------
class TestHistory:
    def test_returns_earlier_broadcast(
        self, client: TestClient, admin_headers: dict, moderator_headers: dict, test_admin, db
    ):
        target = _make_user(db)
        client.post(
            f"{PREFIX}/push",
            json={
                "title": "이력 확인 공지",
                "body": "이력에 남아야 한다",
                "target": "users",
                "userIds": [target.id],
            },
            headers=admin_headers,
        )
        log_id = _latest_broadcast(db).id

        resp = client.get(f"{PREFIX}/history", params={"limit": 100}, headers=moderator_headers)
        assert resp.status_code == 200
        items = resp.json()["data"]
        entry = next(item for item in items if item["id"] == log_id)
        assert entry == {
            "id": log_id,
            "adminId": test_admin.id,
            "adminName": test_admin.name,
            "title": "이력 확인 공지",
            "body": "이력에 남아야 한다",
            "target": "users",
            "targeted": 1,
            "createdAt": entry["createdAt"],
        }
        assert entry["createdAt"]

    def test_tolerates_unparseable_details(
        self, client: TestClient, moderator_headers: dict, test_admin, db
    ):
        log = AdminAuditLog(
            admin_id=test_admin.id,
            action="PUSH_BROADCAST",
            target_type="notification",
            details="{not json at all",
        )
        db.add(log)
        db.commit()
        db.refresh(log)

        resp = client.get(f"{PREFIX}/history", params={"limit": 100}, headers=moderator_headers)
        assert resp.status_code == 200
        entry = next(item for item in resp.json()["data"] if item["id"] == log.id)
        assert entry["title"] == ""
        assert entry["body"] == ""
        assert entry["target"] == ""
        assert entry["targeted"] == 0

    def test_limit_is_bounded(self, client: TestClient, moderator_headers: dict):
        assert client.get(f"{PREFIX}/history", params={"limit": 0}, headers=moderator_headers).status_code == 422
        assert client.get(f"{PREFIX}/history", params={"limit": 101}, headers=moderator_headers).status_code == 422

    def test_admin_name_falls_back_to_email(
        self, client: TestClient, moderator_headers: dict, db
    ):
        nameless = _make_user(db, admin_role="ADMIN")
        nameless.name = None
        db.commit()
        log = AdminAuditLog(
            admin_id=nameless.id,
            action="PUSH_BROADCAST",
            details=json.dumps({"title": "무명", "target": "all", "targeted": 0}, ensure_ascii=False),
        )
        db.add(log)
        db.commit()
        db.refresh(log)

        resp = client.get(f"{PREFIX}/history", params={"limit": 100}, headers=moderator_headers)
        entry = next(item for item in resp.json()["data"] if item["id"] == log.id)
        assert entry["adminName"] == nameless.email
        assert entry["body"] == ""  # missing key -> empty string, not KeyError
