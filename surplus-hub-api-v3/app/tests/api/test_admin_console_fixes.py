"""Regression tests for admin-console defects found in the 2026-10-05 audit."""
import asyncio
from types import SimpleNamespace
from unittest.mock import patch

from app.core.config import settings
from app.models.user import User
from app.tests.conftest import TestingSessionLocal

P = settings.API_V1_STR


def _user(db, email, **kw):
    u = User(email=email, name=email.split("@")[0], is_active=True, **kw)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _audit_actions(client, headers):
    r = client.get(f"{P}/admin/roles/audit-logs", params={"limit": 200}, headers=headers)
    return [log["action"] for log in r.json()["data"]["items"]]


def test_superuser_without_admin_role_can_ban(client, db, superuser_headers):
    target = _user(db, "fix_ban_target@example.com")
    r = client.post(
        f"{P}/admin/users/{target.id}/sanctions",
        json={"sanctionType": "BAN", "reason": "fraud"},
        headers=superuser_headers,
    )
    assert r.status_code == 201
    assert "CREATE_SANCTION" in _audit_actions(client, superuser_headers)


def test_is_active_filter_uses_camel_case_param(client, db, admin_headers):
    inactive = _user(db, "fix_inactive@example.com")
    inactive.is_active = False
    db.commit()
    r = client.get(f"{P}/admin/users", params={"isActive": "false", "limit": 200}, headers=admin_headers)
    emails = [u["email"] for u in r.json()["data"]["items"]]
    assert "fix_inactive@example.com" in emails
    assert all(not u["isActive"] for u in r.json()["data"]["items"])


def test_banned_word_duplicate_409_and_readd_after_delete(client, admin_headers):
    url = f"{P}/admin/moderation/banned-words"
    first = client.post(url, json={"word": "FixWord"}, headers=admin_headers)
    assert first.status_code == 201
    assert client.post(url, json={"word": "fixword "}, headers=admin_headers).status_code == 409
    assert client.post(url, json={"word": "   "}, headers=admin_headers).status_code == 400

    word_id = first.json()["data"]["id"]
    assert client.delete(f"{url}/{word_id}", headers=admin_headers).status_code == 200
    again = client.post(url, json={"word": "fixword"}, headers=admin_headers)
    assert again.status_code == 201
    assert again.json()["data"]["id"] == word_id  # soft-deleted row revived

    actions = _audit_actions(client, admin_headers)
    assert "ADD_BANNED_WORD" in actions and "REMOVE_BANNED_WORD" in actions


def test_export_csv_bom_bad_date_and_formula_escape(client, db, admin_headers):
    _user(db, "fix_csv@example.com")
    db.query(User).filter(User.email == "fix_csv@example.com").update({"name": "=HYPERLINK(1)"})
    db.commit()
    url = f"{P}/admin/dashboard/export/users"

    assert client.get(url, params={"startDate": "2026-13-99"}, headers=admin_headers).status_code == 400

    r = client.get(url, headers=admin_headers)
    assert r.status_code == 200
    assert r.content.startswith(b"\xef\xbb\xbf")
    assert "'=HYPERLINK(1)" in r.text
    assert "EXPORT_DATA" in _audit_actions(client, admin_headers)


def test_export_end_date_is_inclusive(client, db, admin_headers):
    from datetime import date
    today = date.today().isoformat()
    r = client.get(
        f"{P}/admin/dashboard/export/users",
        params={"startDate": "2000-01-01", "endDate": today},
        headers=admin_headers,
    )
    # users seeded today must be included when endDate is today's bare date
    assert "testuser@example.com" in r.text


def test_sqladmin_session_rechecks_superuser(db, test_superuser):
    from app.core.admin_auth import admin_auth

    req = SimpleNamespace(session={"admin_user_id": str(test_superuser.id)})
    with patch("app.core.admin_auth.SessionLocal", TestingSessionLocal):
        assert asyncio.run(admin_auth.authenticate(req)) is True

        demoted = _user(db, "fix_demoted@example.com", is_superuser=False)
        req = SimpleNamespace(session={"admin_user_id": str(demoted.id)})
        assert asyncio.run(admin_auth.authenticate(req)) is False
