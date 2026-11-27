"""
Tests for /api/v1/wanted (구매 요청 / RFQ) — 매칭 알림과 수요(진단·급구 전광판) 반영 포함.

테스트 DB는 세션 전체가 공유하므로 테스트마다 지어낸 고유 품목명, 서로 1도(≈111km) 이상 떨어진 좌표,
일일·OPEN 상한이 섞이지 않도록 새 사용자를 쓴다.
"""

from datetime import datetime, timedelta, timezone
from itertools import count
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.ai.services import triage as triage_service
from app.ai.services import wanted as wanted_service
from app.core.cache import cache_clear_all
from app.core.security import create_access_token, get_password_hash
from app.models.admin import AdminAuditLog
from app.models.material import Material
from app.models.moderation import BannedWord
from app.models.notification import Notification
from app.models.search_log import SearchLog
from app.models.user import User
from app.models.wanted import WantedRequest

URL = "/api/v1/wanted"
_seq = count()


def _loc(i: int) -> tuple[float, float]:
    """테스트별 고립 좌표 (남반구, 다른 테스트 파일과 겹치지 않음). 위도 1도씩 떨어져 반경 100km도 안 겹친다."""
    return -30.0 - i, -60.0


@pytest.fixture(autouse=True)
def _no_push():
    with patch("app.core.notify.send_push_notification", return_value={"success": 0}):
        yield


@pytest.fixture(autouse=True)
def _no_vision(monkeypatch):
    monkeypatch.setattr(triage_service, "_vision_available", lambda: False)


def _user(db) -> tuple[User, dict]:
    n = next(_seq)
    user = User(
        email=f"wanted{n}@example.com", hashed_password=get_password_hash("pw"), name=f"구매자{n}", is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, {"Authorization": f"Bearer {create_access_token(subject=user.id)}"}


def _body(lat, lng, **over) -> dict:
    return {
        "title": "쿼크볼트 50A", "category": "설비", "locationAddress": "경기 안산시 단원구", "lat": lat, "lng": lng,
        **over,
    }


def _create(client, headers, lat, lng, **over) -> dict:
    r = client.post(URL, json=_body(lat, lng, **over), headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def _insert(db, user_id, lat, lng, title="삽입요청", **over) -> WantedRequest:
    over.setdefault("expires_at", datetime.now(timezone.utc) + timedelta(days=30))
    w = WantedRequest(
        user_id=user_id, title=title, category="기타", location_address="테스트", location_lat=lat, location_lng=lng,
        **over,
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return w


def _material(db, seller_id, title, lat, lng, **over) -> Material:
    m = Material(
        title=title, description=title, price=10_000, location_address="테스트", location_lat=lat, location_lng=lng,
        seller_id=seller_id, status=over.pop("status", "ACTIVE"), **over,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def _post_material(client, headers, title, lat, lng, **over):
    r = client.post("/api/v1/materials/", json={
        "title": title, "description": f"{title} 처분", "price": 10_000,
        "location": {"address": "테스트", "lat": lat, "lng": lng}, **over,
    }, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def _matches_for(db, user_id) -> list[Notification]:
    return db.query(Notification).filter(
        Notification.user_id == user_id, Notification.type == "WANTED_MATCH",
    ).all()


class TestCreate:
    def test_requires_auth(self, client: TestClient):
        assert client.post(URL, json=_body(0, 0)).status_code == 401

    def test_create_contract(self, client: TestClient, db):
        user, h = _user(db)
        lat, lng = _loc(0)
        d = _create(client, h, lat, lng, description="20m 정도", quantity=20, quantityUnit="m", budgetMax=300000)
        assert d["title"] == "쿼크볼트 50A" and d["category"] == "설비" and d["status"] == "OPEN"
        assert d["location"] == {"address": "경기 안산시 단원구", "lat": lat, "lng": lng}
        assert (d["quantity"], d["quantityUnit"], d["budgetMax"], d["radiusKm"]) == (20, "m", 300000, 30)
        assert d["requester"] == {"id": user.id, "name": user.name, "avatarUrl": None, "trustLevel": 1}
        expires = datetime.fromisoformat(d["expiresAt"])
        assert timedelta(days=29, hours=23) < expires - datetime.now(timezone.utc) <= timedelta(days=30)
        assert d["createdAt"] is not None

    @pytest.mark.parametrize("over", [
        {"title": "가"},
        {"title": "가" * 101},
        {"title": "   "},
        {"category": "문창호"},  # 시드 이름은 "문/창호"
        {"radiusKm": 4},
        {"radiusKm": 101},
        {"expiresInDays": 0},
        {"expiresInDays": 91},
        {"lat": 91},
        {"lat": None},
        {"locationAddress": ""},
        {"budgetMax": -1},
        {"quantity": 1_000_001},
        {"description": "가" * 2001},
    ])
    def test_invalid_422(self, client: TestClient, auth_headers, over):
        assert client.post(URL, json={**_body(1, 1), **over}, headers=auth_headers).status_code == 422

    def test_slash_category_accepted(self, client: TestClient, db):
        _, h = _user(db)
        assert _create(client, h, *_loc(0), category="문/창호")["category"] == "문/창호"

    def test_banned_word_400(self, client: TestClient, db):
        _, h = _user(db)
        bw = BannedWord(word="금칙테스트어")
        db.add(bw)
        db.commit()
        try:
            r = client.post(URL, json=_body(*_loc(0), description="설명에 금칙테스트어 포함"), headers=h)
            assert r.status_code == 400 and "금칙어" in r.json()["detail"]
        finally:
            bw.is_active = False
            db.commit()

    def test_daily_cap_429(self, client: TestClient, db):
        _, h = _user(db)
        for _ in range(10):
            _create(client, h, *_loc(0))
        r = client.post(URL, json=_body(*_loc(0)), headers=h)
        assert r.status_code == 429 and "하루 10건" in r.json()["detail"]

    def test_open_cap_429_counts_only_open_unexpired(self, client: TestClient, db):
        user, h = _user(db)
        old = datetime.now(timezone.utc) - timedelta(days=2)  # 일일 상한에는 안 걸리게
        for _ in range(19):
            _insert(db, user.id, *_loc(0), created_at=old)
        _insert(db, user.id, *_loc(0), created_at=old, status="CLOSED")
        _insert(db, user.id, *_loc(0), created_at=old, expires_at=old)  # 만료
        _create(client, h, *_loc(0))  # 열린 요청 20번째
        r = client.post(URL, json=_body(*_loc(0)), headers=h)
        assert r.status_code == 429 and "20건" in r.json()["detail"]


class TestList:
    def test_only_open_unexpired(self, client: TestClient, db):
        user, h = _user(db)
        lat, lng = _loc(1)
        open_ = _create(client, h, lat, lng)
        closed = _create(client, h, lat, lng)
        assert client.post(f"{URL}/{closed['id']}/close", headers=h).status_code == 200
        expired = _insert(db, user.id, lat, lng, expires_at=datetime.now(timezone.utc) - timedelta(minutes=1))
        hidden = _insert(db, user.id, lat, lng, status="HIDDEN")

        r = client.get(f"{URL}?lat={lat}&lng={lng}&radiusKm=5")
        assert r.status_code == 200
        assert [w["id"] for w in r.json()["data"]] == [open_["id"]]

        # 만료는 상세에서 EXPIRED로 보이고, 내 목록에는 모든 상태가 나온다
        assert client.get(f"{URL}/{expired.id}").json()["data"]["status"] == "EXPIRED"
        mine = {w["id"]: w["status"] for w in client.get(f"{URL}/me", headers=h).json()["data"]}
        assert mine == {
            open_["id"]: "OPEN", closed["id"]: "CLOSED", expired.id: "EXPIRED", hidden.id: "HIDDEN",
        }

    def test_radius_and_category(self, client: TestClient, db):
        _, h = _user(db)
        lat, lng = _loc(2)
        near = _create(client, h, lat, lng, category="조명")
        far = _create(client, h, lat + 0.45, lng, category="설비")  # 약 50km
        ids = lambda q: [w["id"] for w in client.get(f"{URL}?lat={lat}&lng={lng}{q}").json()["data"]]  # noqa: E731
        assert ids("") == [near["id"]]  # 기본 반경 30km
        assert ids("&radiusKm=100") == [far["id"], near["id"]]  # 최신순
        assert ids("&radiusKm=100&category=조명") == [near["id"]]
        assert client.get(f"{URL}?radiusKm=4").status_code == 422

    def test_cursor_pagination(self, client: TestClient, db):
        _, h = _user(db)
        lat, lng = _loc(3)
        a, b, c = (_create(client, h, lat, lng) for _ in range(3))
        q = f"{URL}?lat={lat}&lng={lng}&radiusKm=5&limit=2"
        p1 = client.get(q).json()
        assert [w["id"] for w in p1["data"]] == [c["id"], b["id"]]
        assert p1["meta"] == {"nextCursor": b["id"], "hasMore": True}
        p2 = client.get(f"{q}&cursor={b['id']}").json()
        assert [w["id"] for w in p2["data"]] == [a["id"]]
        assert p2["meta"] == {"nextCursor": None, "hasMore": False}

        # 좌표 없는 전체 목록도 같은 커서 규칙
        g1 = client.get(f"{URL}?limit=1").json()
        assert len(g1["data"]) == 1 and g1["meta"]["hasMore"] is True
        g2 = client.get(f"{URL}?limit=1&cursor={g1['meta']['nextCursor']}").json()
        assert g2["data"][0]["id"] < g1["data"][0]["id"]


class TestDetail:
    def test_matches_exclude_private_own_far(self, client: TestClient, db, test_user2):
        user, h = _user(db)
        lat, lng = _loc(4)
        w = _create(client, h, lat, lng, title="뮤온브라켓 구해요", radiusKm=10)
        good = _material(db, test_user2.id, "뮤온브라켓 미사용 20개", lat + 0.05, lng)
        _material(db, user.id, "뮤온브라켓 내 매물", lat, lng)
        _material(db, test_user2.id, "뮤온브라켓 숨김", lat, lng, status="HIDDEN")
        _material(db, test_user2.id, "뮤온브라켓 검수중", lat, lng, status="REVIEWING")
        _material(db, test_user2.id, "뮤온브라켓 판매완료", lat, lng, status="SOLD")
        _material(db, test_user2.id, "뮤온브라켓 매입비딩", lat, lng, disposition_path="B")
        _material(db, test_user2.id, "뮤온브라켓 중량처분", lat, lng, disposition_path="C")
        _material(db, test_user2.id, "뮤온브라켓 먼 곳", lat + 0.3, lng)  # 약 33km
        _material(db, test_user2.id, "무관한 자재", lat, lng)

        d = client.get(f"{URL}/{w['id']}").json()["data"]
        assert d["id"] == w["id"] and d["requester"]["id"] == user.id
        assert [m["id"] for m in d["matches"]] == [good.id]
        m = d["matches"][0]
        assert m["seller"]["id"] == test_user2.id and m["location"]["lat"] == lat + 0.05
        assert {"thumbnailUrl", "images", "quantityUnit", "tradeMethod"} - set(m) == set()

    def test_not_found(self, client: TestClient, db):
        user, _ = _user(db)
        hidden = _insert(db, user.id, *_loc(4), status="HIDDEN")
        assert client.get(f"{URL}/{hidden.id}").status_code == 404
        assert client.get(f"{URL}/99999999").status_code == 404

    def test_me_requires_auth(self, client: TestClient):
        assert client.get(f"{URL}/me").status_code == 401  # /{id}로 해석돼 422가 나면 라우트 순서가 틀린 것


class TestClose:
    def test_owner_closes_other_403(self, client: TestClient, db, auth_headers2):
        _, h = _user(db)
        lat, lng = _loc(5)
        w = _create(client, h, lat, lng)
        assert client.post(f"{URL}/{w['id']}/close", headers=auth_headers2).status_code == 403
        r = client.post(f"{URL}/{w['id']}/close", headers=h)
        assert r.status_code == 200 and r.json()["data"]["status"] == "CLOSED"
        assert client.get(f"{URL}?lat={lat}&lng={lng}").json()["data"] == []
        assert client.get(f"{URL}/{w['id']}").json()["data"]["status"] == "CLOSED"  # 상세는 보인다
        assert client.post(f"{URL}/99999999/close", headers=h).status_code == 404


class TestModeration:
    def test_admin_hide(self, client: TestClient, db, moderator_headers, auth_headers2, test_moderator):
        _, h = _user(db)
        lat, lng = _loc(6)
        w = _create(client, h, lat, lng)
        url = f"/api/v1/admin/wanted/{w['id']}/hide"
        assert client.post(url, headers=auth_headers2).status_code == 403
        r = client.post(url, headers=moderator_headers)
        assert r.status_code == 200 and r.json()["data"]["status"] == "HIDDEN"
        assert db.query(AdminAuditLog).filter(
            AdminAuditLog.admin_id == test_moderator.id, AdminAuditLog.action == "HIDE_WANTED",
            AdminAuditLog.target_type == "wanted", AdminAuditLog.target_id == w["id"],
        ).count() == 1
        assert client.get(f"{URL}/{w['id']}").status_code == 404
        assert client.get(f"{URL}?lat={lat}&lng={lng}").json()["data"] == []
        assert client.post(f"{URL}/{w['id']}/close", headers=h).status_code == 404  # 마감으로 숨김을 풀 수 없다
        assert client.post("/api/v1/admin/wanted/99999999/hide", headers=moderator_headers).status_code == 404

    def test_report_accepts_wanted(self, client: TestClient, db, auth_headers2):
        _, h = _user(db)
        w = _create(client, h, *_loc(6))
        r = client.post(
            "/api/v1/reports", json={"targetType": "wanted", "targetId": w["id"], "reason": "spam"},
            headers=auth_headers2,
        )
        assert r.status_code == 201, r.text


class TestMatching:
    def test_one_notification_then_24h_quiet(self, client: TestClient, db, auth_headers2):
        user, h = _user(db)
        lat, lng = _loc(7)
        w = _create(client, h, lat, lng, title="글루온행거 구합니다")
        m = _post_material(client, auth_headers2, "글루온행거 30개", lat + 0.1, lng)
        notes = _matches_for(db, user.id)
        assert len(notes) == 1
        n = notes[0]
        assert (n.reference_type, n.reference_id) == ("wanted", w["id"])
        assert n.title == "찾던 자재가 올라왔어요"
        assert n.body == f"'글루온행거 구합니다'에 맞는 매물: {m['title']}"
        db.expire_all()
        assert db.get(WantedRequest, w["id"]).last_notified_at is not None

        _post_material(client, auth_headers2, "글루온행거 추가 10개", lat, lng)
        assert len(_matches_for(db, user.id)) == 1  # 24시간 안 두 번째 매칭은 알리지 않는다

        # 24시간이 지나면 다시 알린다
        row = db.get(WantedRequest, w["id"])
        row.last_notified_at = datetime.now(timezone.utc) - timedelta(hours=25)
        db.commit()
        _post_material(client, auth_headers2, "글루온행거 또 있음", lat, lng)
        assert len(_matches_for(db, user.id)) == 2

    def test_push_data_carries_material_id(self, client: TestClient, db, auth_headers2):
        from app.models.notification import DeviceToken

        user, h = _user(db)
        lat, lng = _loc(8)
        _create(client, h, lat, lng, title="타우클립 필요")
        db.add(DeviceToken(user_id=user.id, token="ExponentPushToken[wanted-test]", platform="ios"))
        db.commit()
        with patch("app.core.notify.send_push_notification", return_value={"success": 1}) as push:
            m = _post_material(client, auth_headers2, "타우클립 한 박스", lat, lng)
        assert push.call_count == 1
        data = push.call_args.kwargs["data"]
        assert data["type"] == "WANTED_MATCH" and data["referenceType"] == "wanted"
        assert data["materialId"] == str(m["id"])

    def test_one_per_requester_with_several_requests(self, client: TestClient, db, auth_headers2):
        user, h = _user(db)
        lat, lng = _loc(9)
        w1 = _create(client, h, lat, lng, title="렙톤패널 A형")
        w2 = _create(client, h, lat, lng, title="렙톤패널 B형")
        _post_material(client, auth_headers2, "렙톤패널 재고", lat, lng)
        notes = _matches_for(db, user.id)
        assert len(notes) == 1 and notes[0].reference_id == w2["id"]  # 가장 최근 요청이 대표
        db.expire_all()
        assert db.get(WantedRequest, w1["id"]).last_notified_at is not None

    @pytest.mark.parametrize("case", ["own", "far", "reviewing", "closed"])
    def test_no_match(self, client: TestClient, db, auth_headers2, case):
        user, h = _user(db)
        lat, lng = _loc(10 + ["own", "far", "reviewing", "closed"].index(case))
        w = _create(client, h, lat, lng, title="보존밸브 구함", radiusKm=10)
        if case == "own":
            _post_material(client, h, "보존밸브 처분", lat, lng)
        elif case == "far":
            _post_material(client, auth_headers2, "보존밸브 처분", lat + 0.2, lng)  # 약 22km
        elif case == "reviewing":
            _post_material(client, auth_headers2, "보존밸브 처분", lat, lng, status="REVIEWING")
        else:
            client.post(f"{URL}/{w['id']}/close", headers=h)
            _post_material(client, auth_headers2, "보존밸브 처분", lat, lng)
        assert _matches_for(db, user.id) == []

    def test_b_c_track_never_matches(self, db, test_user2):
        user, _ = _user(db)
        lat, lng = _loc(14)
        _insert(db, user.id, lat, lng, title="하드론앵커")
        for path in ("B", "C"):
            m = _material(db, test_user2.id, "하드론앵커 매입", lat, lng, disposition_path=path)
            assert wanted_service.match_wanted_for_material(db, m.id) == 0
        assert _matches_for(db, user.id) == []

    def test_status_change_to_active_triggers(self, client: TestClient, db, auth_headers2):
        user, h = _user(db)
        lat, lng = _loc(15)
        _create(client, h, lat, lng, title="페르미온덕트")
        m = _post_material(client, auth_headers2, "페르미온덕트 재고", lat, lng, status="REVIEWING")
        assert _matches_for(db, user.id) == []
        r = client.patch(f"/api/v1/materials/{m['id']}/status", json={"status": "ACTIVE"}, headers=auth_headers2)
        assert r.status_code == 200, r.text
        assert len(_matches_for(db, user.id)) == 1

    def test_admin_approve_triggers(self, client: TestClient, db, auth_headers2, superuser_headers):
        user, h = _user(db)
        lat, lng = _loc(16)
        _create(client, h, lat, lng, title="보손트레이")
        m = _post_material(client, auth_headers2, "보손트레이 묶음", lat, lng, status="REVIEWING")
        assert _matches_for(db, user.id) == []
        r = client.patch(
            f"/api/v1/admin/materials/{m['id']}/review", json={"action": "approve"}, headers=superuser_headers,
        )
        assert r.status_code == 200, r.text
        assert len(_matches_for(db, user.id)) == 1

    def test_triage_convert_triggers(self, client: TestClient, db, auth_headers2):
        user, h = _user(db)
        lat, lng = _loc(17)
        _create(client, h, lat, lng, title="중성미자거치대")
        d = client.post("/api/v1/ai/triage", json={
            "specText": "중성미자거치대 10개", "conditionGrade": "상", "lat": lat, "lng": lng,
        }, headers=auth_headers2).json()["data"]
        r = client.post(f"/api/v1/ai/triage/{d['id']}/convert", json={"path": "A"}, headers=auth_headers2)
        assert r.status_code == 200, r.text
        assert len(_matches_for(db, user.id)) == 1

    def test_background_uses_given_bind_and_fails_quietly(self, db):
        assert wanted_service.match_wanted_for_material_background(db.get_bind(), 99999999) == 0
        with patch.object(wanted_service, "match_wanted_for_material", side_effect=RuntimeError("boom")):
            assert wanted_service.match_wanted_for_material_background(db.get_bind(), 1) == 0


class TestDemand:
    def _evidence(self, db, lat, lng, title):
        return triage_service._demand_evidence(
            db, material_key=None, title=title, spec_text=None, lat=lat, lng=lng,
        )

    def test_open_request_adds_weight(self, db):
        user, _ = _user(db)
        lat, lng = _loc(18)
        assert self._evidence(db, lat, lng, "스핀너트")["wanted_count"] == 0
        w = _insert(db, user.id, lat, lng, title="스핀너트 구합니다")
        ev = self._evidence(db, lat, lng, "스핀너트")
        assert ev["wanted_count"] == 1 and ev["searches"] == triage_service.WANTED_WEIGHT
        assert self._evidence(db, lat + 1, lng, "스핀너트")["wanted_count"] == 0  # 요청 반경 밖

        for change in ({"status": "CLOSED"}, {"status": "HIDDEN"},
                       {"status": "OPEN", "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}):
            for k, v in change.items():
                setattr(w, k, v)
            db.commit()
            ev = self._evidence(db, lat, lng, "스핀너트")
            assert ev["wanted_count"] == 0 and ev["searches"] == 0

    def test_diagnosis_breakdown_has_wanted_count(self, client: TestClient, db, auth_headers2):
        user, _ = _user(db)
        lat, lng = _loc(19)
        _insert(db, user.id, lat, lng, title="큐비트스페이서")
        d = client.post("/api/v1/ai/triage", json={"specText": "큐비트스페이서", "lat": lat, "lng": lng},
                        headers=auth_headers2).json()["data"]
        assert d["breakdown"]["wantedCount"] == 1 and d["breakdown"]["searchCount"] == 0

    def test_hot_demands_free_text_gate_and_count(self, client: TestClient, db):
        user, _ = _user(db)
        lat, lng = _loc(20)
        db.add_all([SearchLog(query="플라즈마커플러", results_count=0, location_lat=lat, location_lng=lng)
                    for _ in range(2)])
        db.commit()
        url = f"/api/v1/ai/triage/hot-demands?lat={lat}&lng={lng}&radiusKm=10"
        def keys():
            cache_clear_all()  # 전광판 응답은 5분 캐시
            return {i["key"]: i for i in client.get(url).json()["data"]["items"]}

        assert "플라즈마커플러" not in keys()  # 검색 2회는 자유 문구 노출 문턱(3) 미만

        w = _insert(db, user.id, lat, lng, title="플라즈마커플러")
        item = keys()["플라즈마커플러"]
        assert item["searchCount"] == 2 and item["wantedCount"] == 1

        w.status = "CLOSED"
        db.commit()
        assert "플라즈마커플러" not in keys()

    def test_description_filler_is_not_demand(self, db):
        """요청 설명의 일반 문구는 수요 근거가 아니다 — 매칭 알림과 같은 용어 기준."""
        user, _ = _user(db)
        lat, lng = _loc(23)
        _insert(db, user.id, lat, lng, title="그래핀본드 구합니다", description="루미나직송 가능")
        assert self._evidence(db, lat, lng, "루미나직송 볼트")["wanted_count"] == 0
        assert self._evidence(db, lat, lng, "그래핀본드")["wanted_count"] == 1

    def test_own_request_is_not_demand_for_own_diagnosis(self, client: TestClient, db, auth_headers2):
        owner, owner_headers = _user(db)
        lat, lng = _loc(24)
        _create(client, owner_headers, lat, lng, title="타키온클램프")
        body = {"specText": "타키온클램프", "lat": lat, "lng": lng}
        own = client.post("/api/v1/ai/triage", json=body, headers=owner_headers).json()["data"]
        other = client.post("/api/v1/ai/triage", json=body, headers=auth_headers2).json()["data"]
        assert own["breakdown"]["wantedCount"] == 0 and other["breakdown"]["wantedCount"] == 1

    def test_create_rescores_matching_vault(self, client: TestClient, db):
        """새 요청은 검색을 기다리지 않고 보관함 재산정을 건다 (검색과 같은 경로)."""
        _, headers = _user(db)
        lat, lng = _loc(25)
        with patch.object(triage_service, "rescore_vault_for_search_background") as bg:
            _create(client, headers, lat, lng, title="뮤온브라켓")
        assert bg.call_args.args[1:] == ("뮤온브라켓", lat, lng)
        assert bg.call_args.args[0].dialect.name == "sqlite"  # 요청과 같은 엔진

    def test_one_requester_counts_once(self, client: TestClient, db):
        """같은 사람이 같은 요청을 여러 건 올려도 수요 1명 — 자유 문구를 홈 전광판에 스스로 올릴 수 없다."""
        lat, lng = _loc(22)
        spammer, _ = _user(db)
        for _ in range(3):
            _insert(db, spammer.id, lat, lng, title="네온스페이서")
        assert self._evidence(db, lat, lng, "네온스페이서")["wanted_count"] == 1
        url = f"/api/v1/ai/triage/hot-demands?lat={lat}&lng={lng}&radiusKm=10"
        cache_clear_all()
        assert "네온스페이서" not in {i["key"] for i in client.get(url).json()["data"]["items"]}

        for _ in range(2):  # 서로 다른 요청자 3명이면 노출
            _insert(db, _user(db)[0].id, lat, lng, title="네온스페이서")
        cache_clear_all()
        items = {i["key"]: i for i in client.get(url).json()["data"]["items"]}
        assert items["네온스페이서"]["wantedCount"] == 3
        assert self._evidence(db, lat, lng, "네온스페이서")["wanted_count"] == 3

    def test_hot_demands_material_group(self, client: TestClient, db):
        user, _ = _user(db)
        lat, lng = _loc(21)
        w = _insert(db, user.id, lat, lng, title="배관 자재", description="SUS304 50A 20m")
        try:
            items = client.get(
                f"/api/v1/ai/triage/hot-demands?lat={lat}&lng={lng}&radiusKm=10"
            ).json()["data"]["items"]
            # 좌표 없는 검색 로그(다른 테스트)는 어디서나 0.3으로 잡히므로 소재 그룹만 본다
            sus = next(i for i in items if i["key"] == "sus304")
            assert sus["wantedCount"] == 1
        finally:  # 전역(좌표 없는) 전광판의 소재 그룹에 남지 않게
            w.status = "CLOSED"
            db.commit()
