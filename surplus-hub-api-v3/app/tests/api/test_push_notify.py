"""
Push transport (app.core.push) + notification fan-out (app.core.notify) + the
preferences/device-token endpoints.

Everything is mocked — no test in this file may reach the network.
"""
import itertools
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core import notify as notify_mod
from app.core import push as push_mod
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.notification import DeviceToken, Notification
from app.models.user import User

PREFIX = f"{settings.API_V1_STR}/notifications"

_seq = itertools.count()


def _make_user(db, **prefs) -> User:
    """A throwaway user so preference flipping never leaks into shared fixtures."""
    n = next(_seq)
    user = User(
        email=f"pushnotify{n}@example.com",
        hashed_password=get_password_hash("password123"),
        name=f"Push Notify {n}",
        is_active=True,
        **prefs,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _add_token(db, user: User, token: str) -> DeviceToken:
    db_obj = DeviceToken(user_id=user.id, token=token, platform="expo", is_active=True)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def _expo_response(tickets: list) -> MagicMock:
    response = MagicMock()
    response.json.return_value = {"data": tickets}
    return response


# ---------------------------------------------------------------------------
# Transport routing
# ---------------------------------------------------------------------------
class TestSendPushNotificationRouting:
    def test_routes_by_token_shape_and_merges_counts(self):
        with patch.object(
            push_mod, "_send_expo",
            return_value={"success": 1, "failure": 0, "invalid_tokens": []},
        ) as m_expo, patch.object(
            push_mod, "_send_fcm",
            return_value={
                "success": 1, "failure": 1,
                "invalid_tokens": ["dead_fcm"], "failed_tokens": ["dead_fcm"],
            },
        ) as m_fcm:
            result = push_mod.send_push_notification(
                tokens=["ExponentPushToken[abc]", "raw_fcm_token"],
                title="T",
                body="B",
            )

        assert m_expo.call_args[0][0] == ["ExponentPushToken[abc]"]
        assert m_fcm.call_args[0][0] == ["raw_fcm_token"]
        assert result == {
            "success": 2,
            "failure": 1,
            "invalid_tokens": ["dead_fcm"],
            "failed_tokens": ["dead_fcm"],
        }

    def test_empty_token_list_returns_zeros(self):
        assert push_mod.send_push_notification(tokens=[], title="T", body="B") == {
            "success": 0,
            "failure": 0,
            "invalid_tokens": [],
            "failed_tokens": [],
        }

    def test_no_transport_configured_reports_skipped(self):
        """Firebase unconfigured + only raw tokens -> skipped, and no exception."""
        with patch.object(push_mod, "_get_firebase_app", return_value=None):
            result = push_mod.send_push_notification(
                tokens=["raw_fcm_token"], title="T", body="B"
            )

        assert result["skipped"] is True
        assert result["success"] == 0


# ---------------------------------------------------------------------------
# Expo transport
# ---------------------------------------------------------------------------
class TestSendExpo:
    def test_chunks_over_100_tokens_into_multiple_posts(self):
        tokens = [f"ExponentPushToken[{i}]" for i in range(250)]
        client = MagicMock()
        client.post.side_effect = lambda url, json, headers: _expo_response(
            [{"status": "ok"} for _ in json]
        )

        with patch.object(push_mod.httpx, "Client") as m_client:
            m_client.return_value.__enter__.return_value = client
            result = push_mod._send_expo(tokens, "T", "B")

        assert client.post.call_count == 3  # 100 + 100 + 50
        assert result["success"] == 250
        assert result["failure"] == 0

    def test_device_not_registered_lands_in_invalid_tokens(self):
        tokens = ["ExponentPushToken[good]", "ExponentPushToken[dead]"]
        client = MagicMock()
        client.post.return_value = _expo_response([
            {"status": "ok"},
            {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}},
        ])

        with patch.object(push_mod.httpx, "Client") as m_client:
            m_client.return_value.__enter__.return_value = client
            result = push_mod._send_expo(tokens, "T", "B")

        assert result["invalid_tokens"] == ["ExponentPushToken[dead]"]
        assert result["success"] == 1
        assert result["failure"] == 1

    def test_badge_is_sent_per_token(self):
        tokens = ["ExponentPushToken[b1]", "ExponentPushToken[b2]"]
        client = MagicMock()
        client.post.return_value = _expo_response([{"status": "ok"}, {"status": "ok"}])

        with patch.object(push_mod.httpx, "Client") as m_client:
            m_client.return_value.__enter__.return_value = client
            push_mod._send_expo(
                tokens, "T", "B", badges={tokens[0]: 3, tokens[1]: 7}
            )

        sent = client.post.call_args.kwargs["json"]
        assert [m["badge"] for m in sent] == [3, 7]

    def test_failed_tokens_names_the_tokens_that_missed(self):
        tokens = ["ExponentPushToken[ok]", "ExponentPushToken[nope]"]
        client = MagicMock()
        client.post.return_value = _expo_response([
            {"status": "ok"},
            {"status": "error", "message": "nope", "details": {"error": "MessageTooBig"}},
        ])

        with patch.object(push_mod.httpx, "Client") as m_client:
            m_client.return_value.__enter__.return_value = client
            result = push_mod._send_expo(tokens, "T", "B")

        assert result["failed_tokens"] == ["ExponentPushToken[nope]"]
        assert result["invalid_tokens"] == []  # 죽은 토큰이 아니라 그냥 실패

    def test_transport_exception_is_swallowed_and_counted_as_failure(self):
        tokens = ["ExponentPushToken[a]", "ExponentPushToken[b]"]

        with patch.object(push_mod.httpx, "Client", side_effect=RuntimeError("boom")):
            result = push_mod._send_expo(tokens, "T", "B")

        assert result["success"] == 0
        assert result["failure"] == 2
        assert result["error"] == "boom"


# ---------------------------------------------------------------------------
# notify()
# ---------------------------------------------------------------------------
class TestNotify:
    def test_creates_row_and_pushes_when_allowed(self, db):
        user = _make_user(db)
        _add_token(db, user, "ExponentPushToken[notify-ok]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={"success": 1, "failure": 0, "invalid_tokens": []},
        ) as m_send:
            notification = notify_mod.notify(
                db, user_id=user.id, type="CHAT", title="T", body="B",
                reference_type="chat_room", reference_id=7,
            )

        assert notification is not None
        assert notification.user_id == user.id
        m_send.assert_called_once()
        kwargs = m_send.call_args.kwargs
        assert kwargs["tokens"] == ["ExponentPushToken[notify-ok]"]
        assert kwargs["data"]["type"] == "CHAT"
        assert kwargs["data"]["referenceId"] == "7"

    def test_push_enabled_false_creates_row_without_pushing(self, db):
        user = _make_user(db, push_enabled=False)
        _add_token(db, user, "ExponentPushToken[notify-off]")

        with patch.object(notify_mod, "send_push_notification") as m_send:
            notification = notify_mod.notify(
                db, user_id=user.id, type="CHAT", title="T", body="B"
            )

        assert notification is not None
        m_send.assert_not_called()

    def test_push_chat_false_blocks_chat_but_not_system(self, db):
        user = _make_user(db, push_chat=False)
        _add_token(db, user, "ExponentPushToken[notify-chatoff]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={"success": 1, "failure": 0, "invalid_tokens": []},
        ) as m_send:
            notify_mod.notify(db, user_id=user.id, type="CHAT", title="T", body="B")
            assert m_send.call_count == 0

            notify_mod.notify(db, user_id=user.id, type="SYSTEM", title="T", body="B")
            assert m_send.call_count == 1

    def test_push_marketing_defaults_off_and_blocks_marketing(self, db):
        user = _make_user(db)
        _add_token(db, user, "ExponentPushToken[notify-mkt]")
        assert user.push_marketing is False  # 정보통신망법 opt-in

        with patch.object(notify_mod, "send_push_notification") as m_send:
            notify_mod.notify(db, user_id=user.id, type="MARKETING", title="T", body="B")

        m_send.assert_not_called()

    def test_deactivates_only_the_invalid_tokens(self, db):
        user = _make_user(db)
        dead = _add_token(db, user, "ExponentPushToken[dead-one]")
        alive = _add_token(db, user, "ExponentPushToken[alive-one]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={"success": 1, "failure": 1, "invalid_tokens": [dead.token]},
        ):
            notify_mod.notify(db, user_id=user.id, type="CHAT", title="T", body="B")

        db.refresh(dead)
        db.refresh(alive)
        assert dead.is_active is False
        assert alive.is_active is True

    def test_returns_none_and_does_not_raise_when_send_blows_up(self, db):
        user = _make_user(db)
        _add_token(db, user, "ExponentPushToken[notify-boom]")

        with patch.object(
            notify_mod, "send_push_notification", side_effect=RuntimeError("boom")
        ):
            assert notify_mod.notify(
                db, user_id=user.id, type="CHAT", title="T", body="B"
            ) is None

    def test_failure_leaves_the_callers_session_usable(self, db):
        """A row that cannot be committed must be rolled back, not left pending."""
        user = _make_user(db)

        # No such user -> FK violation on commit -> session needs a rollback.
        assert notify_mod.notify(
            db, user_id=99_999_999, type="SYSTEM", title="T", body="B"
        ) is None

        # The caller keeps using the same session afterwards (audit log writes, etc.)
        assert db.query(User).filter(User.id == user.id).first() is not None

    def test_unknown_type_creates_the_row_but_refuses_the_push(self, db):
        """정보통신망법 경계에서 미등록 타입은 fail closed."""
        user = _make_user(db)
        _add_token(db, user, "ExponentPushToken[notify-unknown]")

        with patch.object(notify_mod, "send_push_notification") as m_send:
            notification = notify_mod.notify(
                db, user_id=user.id, type="SOMETHING_NEW", title="T", body="B"
            )

        assert notification is not None
        m_send.assert_not_called()

    def test_marketing_typo_does_not_bypass_the_marketing_gate(self, db):
        user = _make_user(db)  # push_marketing defaults to False
        _add_token(db, user, "ExponentPushToken[notify-typo]")

        with patch.object(notify_mod, "send_push_notification") as m_send:
            notify_mod.notify(db, user_id=user.id, type="MARKETNIG", title="T", body="B")

        m_send.assert_not_called()

    def test_marketing_title_gets_the_ad_prefix_exactly_once(self, db):
        user = _make_user(db, push_marketing=True)
        _add_token(db, user, "ExponentPushToken[notify-ad]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={"success": 1, "failure": 0, "invalid_tokens": []},
        ) as m_send:
            first = notify_mod.notify(
                db, user_id=user.id, type="MARKETING", title="여름 할인", body="B"
            )
            second = notify_mod.notify(
                db, user_id=user.id, type="MARKETING", title="(광고) 여름 할인", body="B"
            )

        assert first.title == "(광고) 여름 할인"
        assert second.title == "(광고) 여름 할인"  # 이미 붙어 있으면 중복 표기하지 않는다
        assert m_send.call_args_list[0].kwargs["title"] == "(광고) 여름 할인"
        assert m_send.call_args_list[1].kwargs["title"] == "(광고) 여름 할인"

    def test_marketing_row_is_not_created_without_consent(self, db):
        """광고는 동의 없이 인앱 목록에도 남기지 않는다."""
        user = _make_user(db)  # push_marketing False
        _add_token(db, user, "ExponentPushToken[notify-nomkt]")

        with patch.object(notify_mod, "send_push_notification") as m_send:
            assert notify_mod.notify(
                db, user_id=user.id, type="MARKETING", title="광고", body="B"
            ) is None

        m_send.assert_not_called()
        assert db.query(Notification).filter(Notification.user_id == user.id).count() == 0

    def test_non_string_data_values_are_coerced(self, db):
        user = _make_user(db)
        _add_token(db, user, "ExponentPushToken[notify-coerce]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={"success": 1, "failure": 0, "invalid_tokens": []},
        ) as m_send:
            notify_mod.notify(
                db, user_id=user.id, type="CHAT", title="T", body="B", data={"count": 3},
            )

        assert m_send.call_args.kwargs["data"]["count"] == "3"

    def test_sends_the_real_unread_count_as_badge(self, db):
        user = _make_user(db)
        token = _add_token(db, user, "ExponentPushToken[notify-badge]").token

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={"success": 1, "failure": 0, "invalid_tokens": []},
        ) as m_send:
            notify_mod.notify(db, user_id=user.id, type="CHAT", title="T", body="B")
            assert m_send.call_args.kwargs["badges"] == {token: 1}

            notify_mod.notify(db, user_id=user.id, type="CHAT", title="T", body="B")
            assert m_send.call_args.kwargs["badges"] == {token: 2}


# ---------------------------------------------------------------------------
# notify_many() — regression guard for over-reported `pushed`
# ---------------------------------------------------------------------------
class TestNotifyMany:
    def test_counts_only_users_actually_pushed(self, db):
        pushed_user = _make_user(db)
        _add_token(db, pushed_user, "ExponentPushToken[many-pushed]")

        prefs_off_user = _make_user(db, push_chat=False)
        _add_token(db, prefs_off_user, "ExponentPushToken[many-prefsoff]")

        no_device_user = _make_user(db)  # no device token at all

        def _send(tokens, title, body, data=None, badges=None):
            if tokens == ["ExponentPushToken[many-pushed]"]:
                return {"success": 1, "failure": 0, "invalid_tokens": []}
            raise RuntimeError("unexpected token set")

        with patch.object(notify_mod, "send_push_notification", side_effect=_send):
            stats = notify_mod.notify_many(
                db,
                user_ids=[pushed_user.id, prefs_off_user.id, no_device_user.id],
                type="CHAT",
                title="T",
                body="B",
            )

        assert stats == {
            "targeted": 3,
            "created": 3,
            "pushed": 1,       # only the user with a device and prefs on
            "failed": 0,
            "skipped": 2,      # prefs off + no device
        }

    def test_transport_skipped_is_not_counted_as_pushed(self, db):
        user = _make_user(db)
        _add_token(db, user, "ExponentPushToken[many-skipped]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={"success": 0, "failure": 0, "invalid_tokens": [], "skipped": True},
        ):
            stats = notify_mod.notify_many(
                db, user_ids=[user.id], type="CHAT", title="T", body="B"
            )

        assert stats["pushed"] == 0
        assert stats["skipped"] == 1
        assert stats["created"] == 1

    def test_a_bad_user_does_not_poison_the_healthy_ones(self, db):
        """One un-committable row must not leave the session broken for the rest."""
        ok_user = _make_user(db)
        _add_token(db, ok_user, "ExponentPushToken[many-notpoisoned]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={"success": 1, "failure": 0, "invalid_tokens": []},
        ):
            stats = notify_mod.notify_many(
                # No such user -> FK violation on commit; the healthy user follows it.
                db, user_ids=[99_999_999, ok_user.id], type="CHAT", title="T", body="B",
            )

        assert stats == {
            "targeted": 2, "created": 1, "pushed": 1, "failed": 1, "skipped": 0
        }

    def test_transport_failure_is_not_counted_as_pushed(self, db):
        user = _make_user(db)
        _add_token(db, user, "ExponentPushToken[many-transportfail]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={
                "success": 0, "failure": 1, "invalid_tokens": [],
                "error": "push service unreachable",
            },
        ):
            stats = notify_mod.notify_many(
                db, user_ids=[user.id], type="CHAT", title="T", body="B"
            )

        assert stats == {
            "targeted": 1, "created": 1, "pushed": 0, "failed": 1, "skipped": 0
        }

    def test_all_tokens_dead_is_not_counted_as_pushed(self, db):
        user = _make_user(db)
        dead = _add_token(db, user, "ExponentPushToken[many-alldead]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={
                "success": 0, "failure": 1,
                "invalid_tokens": [dead.token], "failed_tokens": [dead.token],
            },
        ):
            stats = notify_mod.notify_many(
                db, user_ids=[user.id], type="CHAT", title="T", body="B"
            )

        db.refresh(dead)
        assert dead.is_active is False
        assert stats["pushed"] == 0
        assert stats["failed"] == 1

    def test_sends_one_batched_request_for_every_recipient(self, db):
        a, b = _make_user(db), _make_user(db)
        token_a = _add_token(db, a, "ExponentPushToken[batch-a]").token
        token_b = _add_token(db, b, "ExponentPushToken[batch-b]").token

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={
                "success": 2, "failure": 0, "invalid_tokens": [], "failed_tokens": [],
            },
        ) as m_send:
            stats = notify_mod.notify_many(
                db, user_ids=[a.id, b.id], type="SYSTEM", title="T", body="B"
            )

        m_send.assert_called_once()
        assert sorted(m_send.call_args.kwargs["tokens"]) == sorted([token_a, token_b])
        assert stats["pushed"] == 2

    def test_dead_token_is_deactivated_only_for_its_own_owner(self, db):
        a, b = _make_user(db), _make_user(db)
        a_dead = _add_token(db, a, "ExponentPushToken[batch-dead]")
        b_alive = _add_token(db, b, "ExponentPushToken[batch-alive]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={
                "success": 1, "failure": 1,
                "invalid_tokens": [a_dead.token], "failed_tokens": [a_dead.token],
            },
        ):
            stats = notify_mod.notify_many(
                db, user_ids=[a.id, b.id], type="SYSTEM", title="T", body="B"
            )

        db.refresh(a_dead)
        db.refresh(b_alive)
        assert a_dead.is_active is False
        assert b_alive.is_active is True
        assert stats == {
            "targeted": 2, "created": 2, "pushed": 1, "failed": 1, "skipped": 0
        }

    def test_marketing_broadcast_only_reaches_opted_in_users(self, db):
        opted_in = _make_user(db, push_marketing=True)
        _add_token(db, opted_in, "ExponentPushToken[many-mkt-in]")
        opted_out = _make_user(db)
        _add_token(db, opted_out, "ExponentPushToken[many-mkt-out]")

        with patch.object(
            notify_mod, "send_push_notification",
            return_value={
                "success": 1, "failure": 0, "invalid_tokens": [], "failed_tokens": [],
            },
        ) as m_send:
            stats = notify_mod.notify_many(
                db, user_ids=[opted_in.id, opted_out.id],
                type="MARKETING", title="여름 할인", body="B",
            )

        assert m_send.call_args.kwargs["title"] == "(광고) 여름 할인"
        assert stats == {
            "targeted": 2, "created": 1, "pushed": 1, "failed": 0, "skipped": 1
        }
        # 비동의자에게는 인앱 행조차 만들지 않는다
        assert db.query(Notification).filter(
            Notification.user_id == opted_out.id
        ).count() == 0

    def test_created_counts_every_in_app_row(self, db):
        users = [_make_user(db) for _ in range(3)]  # none have devices

        stats = notify_mod.notify_many(
            db, user_ids=[u.id for u in users], type="SYSTEM", title="T", body="B"
        )

        assert stats["created"] == 3
        assert stats["pushed"] == 0
        for user in users:
            assert db.query(Notification).filter(Notification.user_id == user.id).count() == 1


# ---------------------------------------------------------------------------
# Preferences endpoints
# ---------------------------------------------------------------------------
class TestPreferencesEndpoints:
    def test_get_preferences_requires_auth(self, client: TestClient):
        assert client.get(f"{PREFIX}/preferences").status_code == 401

    def test_get_preferences_defaults(self, client: TestClient, auth_headers: dict):
        response = client.get(f"{PREFIX}/preferences", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data == {
            "pushEnabled": True,
            "pushChat": True,
            "pushMaterial": True,
            "pushCommunity": True,
            "pushMarketing": False,
        }

    def test_patch_applies_only_the_fields_sent(self, client: TestClient, auth_headers: dict):
        response = client.patch(
            f"{PREFIX}/preferences", json={"pushMarketing": True}, headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["pushMarketing"] is True
        assert data["pushEnabled"] is True
        assert data["pushChat"] is True
        assert data["pushMaterial"] is True
        assert data["pushCommunity"] is True

        # Round-trip: a fresh GET sees the change
        assert client.get(f"{PREFIX}/preferences", headers=auth_headers).json()["data"] == data

        # Restore the default so the shared session user is untouched
        client.patch(
            f"{PREFIX}/preferences", json={"pushMarketing": False}, headers=auth_headers
        )

    @pytest.mark.parametrize("field", ["pushEnabled", "pushMarketing"])
    def test_explicit_null_is_rejected_not_written(
        self, client: TestClient, auth_headers: dict, field: str
    ):
        response = client.patch(
            f"{PREFIX}/preferences", json={field: None}, headers=auth_headers
        )
        assert response.status_code == 422

    def test_empty_patch_changes_nothing(self, client: TestClient, auth_headers: dict):
        before = client.get(f"{PREFIX}/preferences", headers=auth_headers).json()["data"]
        response = client.patch(f"{PREFIX}/preferences", json={}, headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["data"] == before

    def test_marketing_consent_timestamp_is_recorded_and_cleared(
        self, client: TestClient, auth_headers: dict, test_user, db
    ):
        """정보통신망법: 광고 수신동의 시각을 보존한다."""
        client.patch(
            f"{PREFIX}/preferences", json={"pushMarketing": True}, headers=auth_headers
        )
        db.refresh(test_user)
        assert test_user.push_marketing_consented_at is not None

        client.patch(
            f"{PREFIX}/preferences", json={"pushMarketing": False}, headers=auth_headers
        )
        db.refresh(test_user)
        assert test_user.push_marketing_consented_at is None


# ---------------------------------------------------------------------------
# Device token platform validation
# ---------------------------------------------------------------------------
class TestDeviceTokenPlatform:
    @pytest.mark.parametrize("platform", ["expo", "android"])
    def test_accepts_supported_platforms(
        self, client: TestClient, auth_headers: dict, platform: str
    ):
        token = f"ExponentPushToken[platform-{platform}]"
        response = client.post(
            f"{PREFIX}/device-token",
            json={"token": token, "platform": platform},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["data"]["platform"] == platform

        # Don't leave a live push target on the shared user
        client.request(
            "DELETE", f"{PREFIX}/device-token", json={"token": token}, headers=auth_headers
        )

    def test_rejects_unknown_platform(self, client: TestClient, auth_headers: dict):
        response = client.post(
            f"{PREFIX}/device-token",
            json={"token": "tok_toaster", "platform": "toaster"},
            headers=auth_headers,
        )
        assert response.status_code == 422
