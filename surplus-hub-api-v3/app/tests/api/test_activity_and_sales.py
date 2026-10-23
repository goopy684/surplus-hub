"""Metrics plumbing: daily activity (DAU/WAU/MAU) and sales recorded when a seller marks SOLD."""

from datetime import timedelta

from fastapi.testclient import TestClient

from app.core import activity
from app.core.config import settings
from app.crud.crud_dashboard import crud_dashboard
from app.models.stats import UserDailyActivity
from app.models.transaction import Transaction

API = settings.API_V1_STR
DASHBOARD = f"{API}/admin/dashboard"


def _material_payload(**overrides) -> dict:
    payload = {
        "title": "Sold Test Material",
        "description": "for sale recording",
        "price": 70000,
        "location": {"address": "Seoul"},
        "tradeMethod": "DIRECT",
    }
    payload.update(overrides)
    return payload


def _create_material(client: TestClient, headers: dict) -> int:
    resp = client.post(f"{API}/materials/", json=_material_payload(), headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["id"]


def _sales(db, material_id: int) -> list[Transaction]:
    db.expire_all()
    return db.query(Transaction).filter(Transaction.material_id == material_id).all()


class TestDailyActivity:
    def test_authenticated_request_records_today_once(self, client: TestClient, db, auth_headers, test_user):
        activity._seen.clear()
        today = activity.kst_today()
        db.query(UserDailyActivity).filter(UserDailyActivity.user_id == test_user.id).delete()
        db.commit()

        for _ in range(2):
            assert client.get(f"{API}/users/me", headers=auth_headers).status_code == 200

        rows = db.query(UserDailyActivity).filter(UserDailyActivity.user_id == test_user.id).all()
        assert [(r.date) for r in rows] == [today]

    def test_summary_reports_dau_wau_mau(self, client: TestClient, superuser_headers):
        resp = client.get(f"{DASHBOARD}/summary", headers=superuser_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "activeUsers" not in data  # was "non-banned accounts" mislabeled as 30-day actives
        assert 1 <= data["dau"] <= data["wau"] <= data["mau"]

    def test_weekly_bucket_counts_distinct_users(self, db, test_user, test_user2):
        # A past week no other test touches (they all record "today").
        monday = activity.kst_today() - timedelta(days=140)
        monday -= timedelta(days=monday.weekday())
        rows = [(test_user.id, monday + timedelta(days=i)) for i in range(3)] + [(test_user2.id, monday)]
        db.add_all(UserDailyActivity(user_id=u, date=d) for u, d in rows)
        db.commit()

        week = crud_dashboard.get_active_user_stats(db, period="week", days=200)
        assert {"date": monday.isoformat(), "count": 2} in week  # not 4: same user on 3 days is 1 weekly user

        day = crud_dashboard.get_active_user_stats(db, period="day", days=200)
        assert {"date": monday.isoformat(), "count": 2} in day
        assert {"date": (monday + timedelta(days=1)).isoformat(), "count": 1} in day

    def test_active_users_endpoint(self, client: TestClient, superuser_headers):
        resp = client.get(f"{DASHBOARD}/stats/active-users?period=month&days=90", headers=superuser_headers)
        assert resp.status_code == 200
        assert resp.json()["data"]["period"] == "month"


class TestSaleRecordedOnSold:
    def test_sold_with_chat_partner_records_completed_sale(
        self, client: TestClient, db, auth_headers, auth_headers2, test_user, test_user2
    ):
        material_id = _create_material(client, auth_headers)
        room = client.post(
            f"{API}/chats/rooms", json={"materialId": material_id, "sellerId": test_user.id}, headers=auth_headers2
        )
        assert room.status_code == 200, room.text

        resp = client.put(
            f"{API}/materials/{material_id}",
            json=_material_payload(status="SOLD", buyerId=test_user2.id),
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["status"] == "SOLD"
        [sale] = _sales(db, material_id)
        assert (sale.status, sale.buyer_id, sale.seller_id, sale.price) == ("COMPLETED", test_user2.id, test_user.id, 70000)
        assert sale.completed_at is not None

        # SOLD -> HIDDEN tidies a sold listing; the sale still happened.
        assert client.patch(
            f"{API}/materials/{material_id}/status", json={"status": "HIDDEN"}, headers=auth_headers
        ).status_code == 200
        assert [s.status for s in _sales(db, material_id)] == ["COMPLETED"]

    def test_back_on_sale_cancels_sale(self, client: TestClient, db, auth_headers, auth_headers2, test_user, test_user2):
        material_id = _create_material(client, auth_headers)
        client.post(f"{API}/chats/rooms", json={"materialId": material_id, "sellerId": test_user.id}, headers=auth_headers2)
        assert client.patch(
            f"{API}/materials/{material_id}/status",
            json={"status": "SOLD", "buyerId": test_user2.id},
            headers=auth_headers,
        ).status_code == 200
        assert [s.status for s in _sales(db, material_id)] == ["COMPLETED"]

        assert client.patch(
            f"{API}/materials/{material_id}/status", json={"status": "ACTIVE"}, headers=auth_headers
        ).status_code == 200
        assert [s.status for s in _sales(db, material_id)] == ["CANCELLED"]

    def test_buyer_must_be_chat_partner(self, client: TestClient, db, auth_headers, test_superuser):
        material_id = _create_material(client, auth_headers)
        resp = client.put(
            f"{API}/materials/{material_id}",
            json=_material_payload(title="should not persist", status="SOLD", buyerId=test_superuser.id),
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert _sales(db, material_id) == []
        detail = client.get(f"{API}/materials/{material_id}").json()["data"]
        assert (detail["status"], detail["title"]) == ("ACTIVE", "Sold Test Material")

    def test_sold_without_buyer_still_allowed(self, client: TestClient, db, auth_headers):
        material_id = _create_material(client, auth_headers)
        resp = client.put(f"{API}/materials/{material_id}", json=_material_payload(status="SOLD"), headers=auth_headers)
        assert resp.status_code == 200
        assert _sales(db, material_id) == []
