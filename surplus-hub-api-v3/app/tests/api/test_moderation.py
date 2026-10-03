"""Tests for user management & content moderation endpoints.

Covered:
  - POST /reports             (user-facing)
  - GET  /admin/users         (MODERATOR+)
  - GET  /admin/users/{id}    (MODERATOR+)
  - POST /admin/users/{id}/sanctions   (MODERATOR+ / BAN requires ADMIN+)
  - DELETE /admin/users/{id}/sanctions/{sid} (ADMIN+)
  - POST /admin/users/{id}/notes       (MODERATOR+)
  - GET  /admin/users/{id}/notes       (MODERATOR+)
  - GET  /admin/moderation/reports     (MODERATOR+)
  - PATCH /admin/moderation/reports/{id} (MODERATOR+)
  - GET  /admin/moderation/queue       (MODERATOR+)
  - POST /admin/moderation/bulk        (ADMIN+)
  - GET  /admin/moderation/banned-words  (MODERATOR+)
  - POST /admin/moderation/banned-words  (ADMIN+)
  - DELETE /admin/moderation/banned-words/{id} (ADMIN+)
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token
from app.models.user import User
from app.models.material import Material
from app.models.transaction import Transaction
from app.crud.crud_moderation import crud_moderation
from app.schemas.moderation import SanctionCreate

API_V1_STR = settings.API_V1_STR
REPORTS_PREFIX = f"{API_V1_STR}/reports"
ADMIN_USERS_PREFIX = f"{API_V1_STR}/admin/users"
ADMIN_MOD_PREFIX = f"{API_V1_STR}/admin/moderation"


# ---------------------------------------------------------------------------
# Register moderation routers if not already registered (for standalone test runs)
# ---------------------------------------------------------------------------
def _register_moderation_routers():
    from app.main import app
    from app.api.endpoints import reports, admin_users, admin_moderation

    # Newer starlette exposes deferred includes as _IncludedRouter objects
    # without .path; skip those. Re-registering is harmless (first match wins).
    existing_paths = {r.path for r in app.routes if hasattr(r, "path")}
    prefix = API_V1_STR
    if f"{prefix}/reports" not in existing_paths:
        from fastapi import APIRouter
        mod_router = APIRouter()
        mod_router.include_router(reports.router, prefix="/reports", tags=["reports"])
        mod_router.include_router(admin_users.router, prefix="/admin/users", tags=["admin-users"])
        mod_router.include_router(admin_moderation.router, prefix="/admin/moderation", tags=["admin-moderation"])
        app.include_router(mod_router, prefix=prefix)


_register_moderation_routers()

_NO_AUTH_CODES = (401, 403)


# ---------------------------------------------------------------------------
# Local fixtures (scoped to this module to avoid conflicts with other tests)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def mod_moderator_user(db):
    user = User(
        email="mod_moderator@example.com",
        hashed_password=None,
        name="Mod Moderator",
        is_active=True,
        is_superuser=False,
        admin_role="MODERATOR",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="module")
def mod_admin_user(db):
    user = User(
        email="mod_admin@example.com",
        hashed_password=None,
        name="Mod Admin",
        is_active=True,
        is_superuser=False,
        admin_role="ADMIN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="module")
def mod_target_user(db):
    """일반 사용자 — 제재 및 신고 대상."""
    user = User(
        email="mod_target@example.com",
        hashed_password=None,
        name="Target User",
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="module")
def mod_reporter_user(db):
    """신고를 제출하는 일반 사용자."""
    user = User(
        email="mod_reporter@example.com",
        hashed_password=None,
        name="Reporter User",
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="module")
def mod_moderator_headers(mod_moderator_user):
    token = create_access_token(subject=mod_moderator_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def mod_admin_headers(mod_admin_user):
    token = create_access_token(subject=mod_admin_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def mod_reporter_headers(mod_reporter_user):
    token = create_access_token(subject=mod_reporter_user.id)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests: POST /reports
# ---------------------------------------------------------------------------

class TestCreateReport:
    def test_user_can_create_report(
        self, client: TestClient, mod_reporter_headers, mod_target_user
    ):
        resp = client.post(
            REPORTS_PREFIX,
            json={
                "targetType": "user",
                "targetId": mod_target_user.id,
                "reason": "spam",
                "description": "This user is spamming.",
            },
            headers=mod_reporter_headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["targetType"] == "user"
        assert body["data"]["status"] == "pending"

    def test_self_report_rejected(
        self, client: TestClient, mod_reporter_user, mod_reporter_headers
    ):
        resp = client.post(
            REPORTS_PREFIX,
            json={
                "targetType": "user",
                "targetId": mod_reporter_user.id,
                "reason": "spam",
            },
            headers=mod_reporter_headers,
        )
        assert resp.status_code == 400

    def test_unauthenticated_report_rejected(self, client: TestClient, mod_target_user):
        resp = client.post(
            REPORTS_PREFIX,
            json={
                "targetType": "user",
                "targetId": mod_target_user.id,
                "reason": "abuse",
            },
        )
        assert resp.status_code in _NO_AUTH_CODES

    def test_invalid_target_type_rejected(
        self, client: TestClient, mod_reporter_headers, mod_target_user
    ):
        resp = client.post(
            REPORTS_PREFIX,
            json={
                "targetType": "unknown_type",
                "targetId": mod_target_user.id,
                "reason": "spam",
            },
            headers=mod_reporter_headers,
        )
        assert resp.status_code == 400

    def test_invalid_reason_rejected(
        self, client: TestClient, mod_reporter_headers, mod_target_user
    ):
        resp = client.post(
            REPORTS_PREFIX,
            json={
                "targetType": "material",
                "targetId": 1,
                "reason": "idonotlike",
            },
            headers=mod_reporter_headers,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Tests: GET /admin/users
# ---------------------------------------------------------------------------

class TestListUsers:
    def test_moderator_can_list_users(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.get(ADMIN_USERS_PREFIX, headers=mod_moderator_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "items" in body["data"]
        assert "total" in body["data"]

    def test_unauthenticated_rejected(self, client: TestClient):
        resp = client.get(ADMIN_USERS_PREFIX)
        assert resp.status_code in _NO_AUTH_CODES

    def test_regular_user_rejected(self, client: TestClient, mod_reporter_headers):
        resp = client.get(ADMIN_USERS_PREFIX, headers=mod_reporter_headers)
        assert resp.status_code == 403

    def test_search_filter_works(
        self, client: TestClient, mod_moderator_headers, mod_target_user
    ):
        resp = client.get(
            f"{ADMIN_USERS_PREFIX}?search=mod_target",
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 200
        items = resp.json()["data"]["items"]
        assert any(u["email"] == mod_target_user.email for u in items)


# ---------------------------------------------------------------------------
# Tests: GET /admin/users/{user_id}
# ---------------------------------------------------------------------------

class TestGetUserDetail:
    def test_moderator_can_get_user_detail(
        self, client: TestClient, mod_moderator_headers, mod_target_user
    ):
        resp = client.get(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}",
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["id"] == mod_target_user.id
        assert "sanctions" in body["data"]
        assert "adminNotes" in body["data"]

    def test_nonexistent_user_returns_404(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.get(
            f"{ADMIN_USERS_PREFIX}/999999",
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests: POST /admin/users/{id}/sanctions
# ---------------------------------------------------------------------------

class TestCreateSanction:
    def test_moderator_can_create_warning(
        self, client: TestClient, mod_moderator_headers, mod_target_user
    ):
        resp = client.post(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/sanctions",
            json={"sanctionType": "WARNING", "reason": "First warning"},
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["sanctionType"] == "WARNING"
        assert body["data"]["isActive"] is True

    def test_moderator_cannot_create_ban(
        self, client: TestClient, mod_moderator_headers, mod_target_user
    ):
        """MODERATOR는 BAN 제재를 생성할 수 없음."""
        resp = client.post(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/sanctions",
            json={"sanctionType": "BAN", "reason": "Permanent ban"},
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 403

    def test_admin_can_create_ban(
        self, client: TestClient, mod_admin_headers, mod_target_user, db
    ):
        """ADMIN은 BAN 제재 생성 가능, 유저 is_active = False."""
        resp = client.post(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/sanctions",
            json={"sanctionType": "BAN", "reason": "Repeated violations"},
            headers=mod_admin_headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["sanctionType"] == "BAN"

        # DB에서 유저 is_active 확인
        db.refresh(mod_target_user)
        assert mod_target_user.is_active is False

    def test_nonexistent_user_sanction_404(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.post(
            f"{ADMIN_USERS_PREFIX}/999999/sanctions",
            json={"sanctionType": "WARNING", "reason": "Test"},
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests: DELETE /admin/users/{id}/sanctions/{sid}
# ---------------------------------------------------------------------------

class TestDeactivateSanction:
    def test_admin_can_deactivate_ban_and_restore_user(
        self, client: TestClient, mod_admin_headers, mod_target_user, db
    ):
        """BAN 제재 비활성화 시 유저 is_active가 True로 복구됨."""
        from app.models.moderation import UserSanction

        # 이전 테스트에서 남은 활성 BAN 모두 비활성화 (테스트 격리)
        existing_bans = (
            db.query(UserSanction)
            .filter(
                UserSanction.user_id == mod_target_user.id,
                UserSanction.sanction_type == "BAN",
                UserSanction.is_active == True,  # noqa: E712
            )
            .all()
        )
        for ban in existing_bans:
            ban.is_active = False
        if existing_bans:
            db.commit()

        # 유저 is_active 복구
        mod_target_user.is_active = True
        db.add(mod_target_user)
        db.commit()

        # BAN 제재 먼저 생성
        create_resp = client.post(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/sanctions",
            json={"sanctionType": "BAN", "reason": "Ban for deactivation test"},
            headers=mod_admin_headers,
        )
        assert create_resp.status_code == 201
        sanction_id = create_resp.json()["data"]["id"]

        db.refresh(mod_target_user)
        assert mod_target_user.is_active is False

        # 제재 비활성화
        deactivate_resp = client.delete(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/sanctions/{sanction_id}",
            headers=mod_admin_headers,
        )
        assert deactivate_resp.status_code == 200
        assert deactivate_resp.json()["data"]["isActive"] is False

        db.refresh(mod_target_user)
        assert mod_target_user.is_active is True

    def test_moderator_cannot_deactivate_sanction(
        self, client: TestClient, mod_moderator_headers, mod_admin_headers, mod_target_user
    ):
        """MODERATOR는 제재 비활성화 불가 (ADMIN 이상 필요)."""
        create_resp = client.post(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/sanctions",
            json={"sanctionType": "WARNING", "reason": "Warning for mod test"},
            headers=mod_admin_headers,
        )
        assert create_resp.status_code == 201
        sanction_id = create_resp.json()["data"]["id"]

        resp = client.delete(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/sanctions/{sanction_id}",
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 403

    def test_nonexistent_sanction_404(
        self, client: TestClient, mod_admin_headers, mod_target_user
    ):
        resp = client.delete(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/sanctions/999999",
            headers=mod_admin_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests: Admin Notes
# ---------------------------------------------------------------------------

class TestAdminNotes:
    def test_moderator_can_add_note(
        self, client: TestClient, mod_moderator_headers, mod_target_user
    ):
        resp = client.post(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/notes",
            json={"content": "This user needs monitoring."},
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["content"] == "This user needs monitoring."

    def test_moderator_can_get_notes(
        self, client: TestClient, mod_moderator_headers, mod_target_user
    ):
        resp = client.get(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/notes",
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "items" in body["data"]
        assert body["data"]["total"] >= 1

    def test_regular_user_cannot_add_note(
        self, client: TestClient, mod_reporter_headers, mod_target_user
    ):
        resp = client.post(
            f"{ADMIN_USERS_PREFIX}/{mod_target_user.id}/notes",
            json={"content": "Unauthorized note"},
            headers=mod_reporter_headers,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Tests: GET /admin/moderation/reports
# ---------------------------------------------------------------------------

class TestModerationReports:
    def test_moderator_can_list_reports(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.get(f"{ADMIN_MOD_PREFIX}/reports", headers=mod_moderator_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "items" in body["data"]
        assert "total" in body["data"]

    def test_regular_user_cannot_list_reports(
        self, client: TestClient, mod_reporter_headers
    ):
        resp = client.get(f"{ADMIN_MOD_PREFIX}/reports", headers=mod_reporter_headers)
        assert resp.status_code == 403

    def test_filter_by_status(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.get(
            f"{ADMIN_MOD_PREFIX}/reports?status=pending",
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Tests: PATCH /admin/moderation/reports/{id}
# ---------------------------------------------------------------------------

class TestUpdateReportStatus:
    def test_moderator_can_process_report(
        self,
        client: TestClient,
        mod_moderator_headers,
        mod_reporter_headers,
        mod_target_user,
    ):
        # 먼저 신고 생성
        create_resp = client.post(
            REPORTS_PREFIX,
            json={
                "targetType": "material",
                "targetId": 1,
                "reason": "fraud",
                "description": "Fraudulent listing",
            },
            headers=mod_reporter_headers,
        )
        assert create_resp.status_code == 201
        report_id = create_resp.json()["data"]["id"]

        # 신고 상태 업데이트
        resp = client.patch(
            f"{ADMIN_MOD_PREFIX}/reports/{report_id}",
            json={"status": "resolved"},
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["status"] == "resolved"
        assert body["data"]["reviewedBy"] is not None

    def test_nonexistent_report_returns_404(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.patch(
            f"{ADMIN_MOD_PREFIX}/reports/999999",
            json={"status": "dismissed"},
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 404

    def test_invalid_status_returns_400(
        self, client: TestClient, mod_moderator_headers, mod_reporter_headers, mod_target_user
    ):
        create_resp = client.post(
            REPORTS_PREFIX,
            json={"targetType": "user", "targetId": mod_target_user.id, "reason": "spam"},
            headers=mod_reporter_headers,
        )
        assert create_resp.status_code == 201
        report_id = create_resp.json()["data"]["id"]

        resp = client.patch(
            f"{ADMIN_MOD_PREFIX}/reports/{report_id}",
            json={"status": "pending"},  # pending은 업데이트 불가
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Tests: GET /admin/moderation/queue
# ---------------------------------------------------------------------------

class TestModerationQueue:
    def test_moderator_can_get_queue(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.get(f"{ADMIN_MOD_PREFIX}/queue", headers=mod_moderator_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "items" in body["data"]

    def test_regular_user_cannot_access_queue(
        self, client: TestClient, mod_reporter_headers
    ):
        resp = client.get(f"{ADMIN_MOD_PREFIX}/queue", headers=mod_reporter_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Tests: POST /admin/moderation/bulk
# ---------------------------------------------------------------------------

class TestBulkProcess:
    def test_admin_can_bulk_process(
        self,
        client: TestClient,
        mod_admin_headers,
        mod_moderator_headers,
        mod_reporter_headers,
        mod_target_user,
    ):
        # 신고 2건 생성
        ids = []
        for reason in ["spam", "abuse"]:
            r = client.post(
                REPORTS_PREFIX,
                json={"targetType": "material", "targetId": 10, "reason": reason},
                headers=mod_reporter_headers,
            )
            assert r.status_code == 201
            ids.append(r.json()["data"]["id"])

        resp = client.post(
            f"{ADMIN_MOD_PREFIX}/bulk",
            json={"ids": ids, "action": "dismiss"},
            headers=mod_admin_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["processed"] == 2

    def test_moderator_cannot_bulk_process(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.post(
            f"{ADMIN_MOD_PREFIX}/bulk",
            json={"ids": [1], "action": "dismiss"},
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 403

    def test_invalid_action_returns_400(
        self, client: TestClient, mod_admin_headers
    ):
        resp = client.post(
            f"{ADMIN_MOD_PREFIX}/bulk",
            json={"ids": [1], "action": "delete_all"},
            headers=mod_admin_headers,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Tests: Banned Words CRUD
# ---------------------------------------------------------------------------

class TestBannedWords:
    def test_admin_can_add_banned_word(
        self, client: TestClient, mod_admin_headers
    ):
        resp = client.post(
            f"{ADMIN_MOD_PREFIX}/banned-words",
            json={"word": "badword123"},
            headers=mod_admin_headers,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["word"] == "badword123"
        assert body["data"]["isActive"] is True

    def test_moderator_can_list_banned_words(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.get(
            f"{ADMIN_MOD_PREFIX}/banned-words", headers=mod_moderator_headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "items" in body["data"]

    def test_moderator_cannot_add_banned_word(
        self, client: TestClient, mod_moderator_headers
    ):
        resp = client.post(
            f"{ADMIN_MOD_PREFIX}/banned-words",
            json={"word": "forbiddenword"},
            headers=mod_moderator_headers,
        )
        assert resp.status_code == 403

    def test_admin_can_delete_banned_word(
        self, client: TestClient, mod_admin_headers
    ):
        # 단어 생성
        create_resp = client.post(
            f"{ADMIN_MOD_PREFIX}/banned-words",
            json={"word": "wordtodelete"},
            headers=mod_admin_headers,
        )
        assert create_resp.status_code == 201
        word_id = create_resp.json()["data"]["id"]

        # 단어 삭제(비활성화)
        delete_resp = client.delete(
            f"{ADMIN_MOD_PREFIX}/banned-words/{word_id}",
            headers=mod_admin_headers,
        )
        assert delete_resp.status_code == 200
        assert delete_resp.json()["data"]["isActive"] is False

    def test_delete_nonexistent_banned_word_returns_404(
        self, client: TestClient, mod_admin_headers
    ):
        resp = client.delete(
            f"{ADMIN_MOD_PREFIX}/banned-words/999999",
            headers=mod_admin_headers,
        )
        assert resp.status_code == 404

    def test_regular_user_cannot_list_banned_words(
        self, client: TestClient, mod_reporter_headers
    ):
        resp = client.get(
            f"{ADMIN_MOD_PREFIX}/banned-words", headers=mod_reporter_headers
        )
        assert resp.status_code == 403

# ---------------------------------------------------------------------------
# Tests: BAN releases materials locked by cancelled transactions (H10)
# ---------------------------------------------------------------------------


class TestBanRestoresMaterial:
    def _make_deal(self, db, *, material_status, txn_status="PENDING"):
        """Seed a seller, buyer, listing and one transaction between them."""
        import uuid

        suffix = uuid.uuid4().hex[:8]
        seller = User(email=f"seller_{suffix}@example.com", name="Seller", is_active=True)
        buyer = User(email=f"buyer_{suffix}@example.com", name="Buyer", is_active=True)
        db.add_all([seller, buyer])
        db.commit()
        db.refresh(seller)
        db.refresh(buyer)

        material = Material(
            title=f"Rebar {suffix}",
            description="surplus rebar",
            price=10000,
            location_address="Seoul",
            seller_id=seller.id,
            status=material_status,
        )
        db.add(material)
        db.commit()
        db.refresh(material)

        txn = Transaction(
            material_id=material.id,
            seller_id=seller.id,
            buyer_id=buyer.id,
            price=10000,
            status=txn_status,
        )
        db.add(txn)
        db.commit()
        db.refresh(txn)
        return seller, buyer, material, txn

    def test_ban_restores_reserved_material_to_active(self, db, mod_admin_user):
        seller, buyer, material, txn = self._make_deal(db, material_status="RESERVED")

        crud_moderation.create_sanction(
            db,
            user_id=buyer.id,
            admin_id=mod_admin_user.id,
            admin_role="ADMIN",
            data=SanctionCreate(sanction_type="BAN", reason="fraud"),
        )

        db.refresh(txn)
        db.refresh(material)
        db.refresh(buyer)
        assert txn.status == "CANCELLED"
        assert material.status == "ACTIVE"  # released, no longer dead stock
        assert buyer.is_active is False

    def test_ban_does_not_touch_sold_material(self, db, mod_admin_user):
        # A COMPLETED-then-SOLD listing must stay SOLD even when a party is banned.
        seller, buyer, material, txn = self._make_deal(
            db, material_status="SOLD", txn_status="CONFIRMED"
        )

        crud_moderation.create_sanction(
            db,
            user_id=buyer.id,
            admin_id=mod_admin_user.id,
            admin_role="ADMIN",
            data=SanctionCreate(sanction_type="BAN", reason="abuse"),
        )

        db.refresh(txn)
        db.refresh(material)
        assert txn.status == "CANCELLED"
        assert material.status == "SOLD"  # untouched
