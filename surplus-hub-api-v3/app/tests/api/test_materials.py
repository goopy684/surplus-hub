"""
Tests for /api/v1/materials/ endpoints.

Fixtures are session-scoped (shared state across all tests in the session).
Tests are ordered to reflect the natural lifecycle of a material:
  create -> list -> read -> update -> status change -> like -> delete.

User roles:
  - test_user  (id=1): creates and owns the material
  - test_user2 (id=2): used to verify non-owner restrictions
  - test_superuser (id=3): admin, can change status on any material
"""

import pytest
from fastapi.testclient import TestClient

API_V1_STR = "/api/v1"

# ---------------------------------------------------------------------------
# Module-level state shared between ordered tests
# ---------------------------------------------------------------------------
_created_material_id: int = 0


# ===== CREATE =====


class TestCreateMaterial:
    """POST /api/v1/materials/"""

    def test_create_without_auth_returns_401(self, client: TestClient):
        """Unauthenticated requests to a protected endpoint return 401."""
        payload = {
            "title": "Unauthorized Material",
            "description": "Should fail",
            "price": 5000,
            "location": {"address": "Seoul"},
            "quantity": 1,
            "quantityUnit": "EA",
            "tradeMethod": "DIRECT",
        }
        response = client.post(f"{API_V1_STR}/materials/", json=payload)
        assert response.status_code == 401

    def test_create_material_success(
        self, client: TestClient, auth_headers: dict, test_user
    ):
        """Authenticated user can create a material."""
        global _created_material_id

        payload = {
            "title": "Test Steel Beam",
            "description": "Surplus H-beam from construction site",
            "price": 150000,
            "location": {"address": "Seoul Gangnam"},
            "quantity": 10,
            "quantityUnit": "EA",
            "tradeMethod": "DIRECT",
            "photoUrls": [],
        }
        response = client.post(
            f"{API_V1_STR}/materials/", json=payload, headers=auth_headers
        )
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "success"
        assert "data" in body

        data = body["data"]
        assert data["title"] == "Test Steel Beam"
        assert data["description"] == "Surplus H-beam from construction site"
        assert data["price"] == 150000
        assert data["seller_id"] == test_user.id

        # Save for subsequent tests
        _created_material_id = data["id"]
        assert _created_material_id > 0

    def test_create_material_rejects_inline_data_url(
        self, client: TestClient, auth_headers: dict
    ):
        """Base64 data URLs must be uploaded first, never stored in the DB."""
        payload = {
            "title": "Inline Image",
            "description": "x",
            "price": 1000,
            "location": {"address": "Seoul"},
            "photoUrls": ["data:image/png;base64,iVBORw0KGgo="],
        }
        response = client.post(
            f"{API_V1_STR}/materials/", json=payload, headers=auth_headers
        )
        assert response.status_code == 422

    def test_create_material_minimal_fields(
        self, client: TestClient, auth_headers: dict
    ):
        """Create with only required fields (no photoUrls, using defaults)."""
        payload = {
            "title": "Leftover Cement",
            "description": "20 bags of Portland cement",
            "price": 80000,
            "location": {"address": "Busan Haeundae"},
        }
        response = client.post(
            f"{API_V1_STR}/materials/", json=payload, headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["title"] == "Leftover Cement"


# ===== LIST =====


class TestListMaterials:
    """GET /api/v1/materials/"""

    def test_list_materials_no_auth(self, client: TestClient):
        """Public endpoint -- no authentication required."""
        response = client.get(f"{API_V1_STR}/materials/")
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "success"
        assert isinstance(body["data"], list)
        assert "meta" in body

        meta = body["meta"]
        assert "totalCount" in meta
        assert "page" in meta
        assert "limit" in meta
        assert "hasNextPage" in meta
        assert "totalPages" in meta

    def test_list_materials_contains_created(self, client: TestClient):
        """The material created earlier should appear in the listing."""
        response = client.get(f"{API_V1_STR}/materials/")
        body = response.json()
        ids = [m["id"] for m in body["data"]]
        assert _created_material_id in ids

    def test_list_materials_pagination(self, client: TestClient):
        """Verify pagination parameters are respected."""
        response = client.get(f"{API_V1_STR}/materials/?page=1&limit=1")
        assert response.status_code == 200
        body = response.json()
        assert len(body["data"]) <= 1
        assert body["meta"]["limit"] == 1
        assert body["meta"]["page"] == 1

    def test_list_materials_keyword_filter(self, client: TestClient):
        """Search by keyword should filter results."""
        response = client.get(
            f"{API_V1_STR}/materials/?keyword=Steel"
        )
        assert response.status_code == 200
        body = response.json()
        # Our test material title contains "Steel"
        if body["meta"]["totalCount"] > 0:
            titles = [m["title"] for m in body["data"]]
            assert any("Steel" in t for t in titles)


# ===== READ DETAIL =====


class TestReadMaterial:
    """GET /api/v1/materials/{id}"""

    def test_read_material_success(self, client: TestClient):
        """Get a specific material by ID (public, no auth)."""
        response = client.get(f"{API_V1_STR}/materials/{_created_material_id}")
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "success"
        assert body["data"]["id"] == _created_material_id
        assert body["data"]["title"] == "Test Steel Beam"

    def test_read_material_not_found(self, client: TestClient):
        """Non-existent material returns 404."""
        response = client.get(f"{API_V1_STR}/materials/999999")
        assert response.status_code == 404


# ===== UPDATE =====


class TestUpdateMaterial:
    """PUT /api/v1/materials/{id}"""

    def test_update_without_auth_returns_401(self, client: TestClient):
        payload = {
            "title": "Updated Title",
            "description": "Updated",
            "price": 200000,
            "location": {"address": "Seoul"},
        }
        response = client.put(
            f"{API_V1_STR}/materials/{_created_material_id}", json=payload
        )
        assert response.status_code == 401

    def test_update_by_non_owner_returns_403(
        self, client: TestClient, auth_headers2: dict
    ):
        """test_user2 is not the owner and should be forbidden."""
        payload = {
            "title": "Hijacked Title",
            "description": "Should fail",
            "price": 999,
            "location": {"address": "Nowhere"},
        }
        response = client.put(
            f"{API_V1_STR}/materials/{_created_material_id}",
            json=payload,
            headers=auth_headers2,
        )
        assert response.status_code == 403

    def test_update_by_owner_success(
        self, client: TestClient, auth_headers: dict
    ):
        """Owner (test_user) can update their own material."""
        payload = {
            "title": "Updated Steel Beam",
            "description": "Updated description",
            "price": 120000,
            "location": {"address": "Seoul Seocho"},
        }
        response = client.put(
            f"{API_V1_STR}/materials/{_created_material_id}",
            json=payload,
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()["data"]
        assert data["title"] == "Updated Steel Beam"
        assert data["price"] == 120000

    def test_update_nonexistent_returns_404(
        self, client: TestClient, auth_headers: dict
    ):
        payload = {
            "title": "Ghost",
            "description": "Does not exist",
            "price": 1,
            "location": {"address": "Void"},
        }
        response = client.put(
            f"{API_V1_STR}/materials/999999",
            json=payload,
            headers=auth_headers,
        )
        assert response.status_code == 404


# ===== STATUS =====


class TestUpdateMaterialStatus:
    """PATCH /api/v1/materials/{id}/status"""

    def test_status_update_without_auth_returns_401(self, client: TestClient):
        response = client.patch(
            f"{API_V1_STR}/materials/{_created_material_id}/status",
            json={"status": "SOLD"},
        )
        assert response.status_code == 401

    def test_status_update_by_non_owner_returns_403(
        self, client: TestClient, auth_headers2: dict
    ):
        """test_user2 is neither owner nor admin."""
        response = client.patch(
            f"{API_V1_STR}/materials/{_created_material_id}/status",
            json={"status": "SOLD"},
            headers=auth_headers2,
        )
        assert response.status_code == 403

    def test_status_update_invalid_status_returns_400(
        self, client: TestClient, auth_headers: dict
    ):
        response = client.patch(
            f"{API_V1_STR}/materials/{_created_material_id}/status",
            json={"status": "INVALID"},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_status_update_by_owner_success(
        self, client: TestClient, auth_headers: dict
    ):
        """Owner can mark their material as SOLD."""
        response = client.patch(
            f"{API_V1_STR}/materials/{_created_material_id}/status",
            json={"status": "SOLD"},
            headers=auth_headers,
        )
        assert response.status_code == 200

        data = response.json()["data"]
        assert data["status"] == "SOLD"

    def test_status_update_back_to_active_by_owner(
        self, client: TestClient, auth_headers: dict
    ):
        """Restore to ACTIVE for subsequent tests."""
        response = client.patch(
            f"{API_V1_STR}/materials/{_created_material_id}/status",
            json={"status": "ACTIVE"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "ACTIVE"

    def test_status_update_by_admin_success(
        self, client: TestClient, superuser_headers: dict
    ):
        """Admin (superuser) can change status on any material."""
        response = client.patch(
            f"{API_V1_STR}/materials/{_created_material_id}/status",
            json={"status": "REVIEWING"},
            headers=superuser_headers,
        )
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "REVIEWING"

        # Restore to ACTIVE
        client.patch(
            f"{API_V1_STR}/materials/{_created_material_id}/status",
            json={"status": "ACTIVE"},
            headers=superuser_headers,
        )

    def test_status_update_nonexistent_returns_404(
        self, client: TestClient, auth_headers: dict
    ):
        response = client.patch(
            f"{API_V1_STR}/materials/999999/status",
            json={"status": "SOLD"},
            headers=auth_headers,
        )
        assert response.status_code == 404


# ===== LIKE =====


class TestMaterialLike:
    """POST/GET /api/v1/materials/{id}/like"""

    def test_like_without_auth_returns_401(self, client: TestClient):
        response = client.post(
            f"{API_V1_STR}/materials/{_created_material_id}/like"
        )
        assert response.status_code == 401

    def test_check_like_without_auth_returns_401(self, client: TestClient):
        response = client.get(
            f"{API_V1_STR}/materials/{_created_material_id}/like"
        )
        assert response.status_code == 401

    def test_toggle_like_on(
        self, client: TestClient, auth_headers: dict
    ):
        """First toggle should set isLiked=True."""
        response = client.post(
            f"{API_V1_STR}/materials/{_created_material_id}/like",
            headers=auth_headers,
        )
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "success"
        data = body["data"]
        # LikeStatusResponse uses aliases: isLiked, likesCount
        assert data["isLiked"] is True
        assert data["likesCount"] >= 1

    def test_check_like_status_after_like(
        self, client: TestClient, auth_headers: dict
    ):
        """GET like endpoint should confirm the material is liked."""
        response = client.get(
            f"{API_V1_STR}/materials/{_created_material_id}/like",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["isLiked"] is True

    def test_toggle_like_off(
        self, client: TestClient, auth_headers: dict
    ):
        """Second toggle should unlike (isLiked=False)."""
        response = client.post(
            f"{API_V1_STR}/materials/{_created_material_id}/like",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["isLiked"] is False

    def test_check_like_status_after_unlike(
        self, client: TestClient, auth_headers: dict
    ):
        response = client.get(
            f"{API_V1_STR}/materials/{_created_material_id}/like",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["isLiked"] is False

    def test_like_nonexistent_material_returns_404(
        self, client: TestClient, auth_headers: dict
    ):
        response = client.post(
            f"{API_V1_STR}/materials/999999/like",
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_check_like_nonexistent_material_returns_404(
        self, client: TestClient, auth_headers: dict
    ):
        response = client.get(
            f"{API_V1_STR}/materials/999999/like",
            headers=auth_headers,
        )
        assert response.status_code == 404


# ===== DELETE =====


class TestDeleteMaterial:
    """DELETE /api/v1/materials/{id}"""

    def test_delete_without_auth_returns_401(self, client: TestClient):
        response = client.delete(
            f"{API_V1_STR}/materials/{_created_material_id}"
        )
        assert response.status_code == 401

    def test_delete_by_non_owner_returns_403(
        self, client: TestClient, auth_headers2: dict
    ):
        response = client.delete(
            f"{API_V1_STR}/materials/{_created_material_id}",
            headers=auth_headers2,
        )
        assert response.status_code == 403

    def test_delete_by_owner_success(
        self, client: TestClient, auth_headers: dict
    ):
        """Owner can soft-delete their material."""
        response = client.delete(
            f"{API_V1_STR}/materials/{_created_material_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"

    def test_deleted_material_not_in_active_list(self, client: TestClient):
        """Soft-deleted (HIDDEN) material should not appear in default listing
        because the list endpoint filters by status=ACTIVE."""
        response = client.get(f"{API_V1_STR}/materials/")
        body = response.json()
        ids = [m["id"] for m in body["data"]]
        assert _created_material_id not in ids

    def test_delete_nonexistent_returns_404(
        self, client: TestClient, auth_headers: dict
    ):
        response = client.delete(
            f"{API_V1_STR}/materials/999999",
            headers=auth_headers,
        )
        assert response.status_code == 404


# ===== PHASE 1: CONDITION GRADE & LOCATION FILTER =====

_phase1_material_id: int = 0


class TestConditionGrade:
    """Phase 1 B2B fields: condition_grade and location filter."""

    def test_create_with_condition_grade(
        self, client: TestClient, auth_headers: dict
    ):
        """Create material with condition_grade field."""
        global _phase1_material_id
        payload = {
            "title": "LED 조명 부자재",
            "description": "공장 잉여분 LED 모듈 50개",
            "price": 300000,
            "location": {"address": "경기도 안양시"},
            "quantity": 50,
            "quantityUnit": "개",
            "conditionGrade": "상",
            "photoUrls": [],
        }
        response = client.post(
            f"{API_V1_STR}/materials/", json=payload, headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data.get("condition_grade") == "상" or data.get("conditionGrade") == "상"
        _phase1_material_id = data["id"]

    def test_create_without_condition_grade(
        self, client: TestClient, auth_headers: dict
    ):
        """condition_grade is optional — create should succeed without it."""
        payload = {
            "title": "사무실 문짝",
            "description": "미사용 문짝 10개",
            "price": 500000,
            "location": {"address": "서울특별시 강남구"},
        }
        response = client.post(
            f"{API_V1_STR}/materials/", json=payload, headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data.get("condition_grade") is None or data.get("conditionGrade") is None

    def test_filter_by_condition_grade(self, client: TestClient):
        """Filter materials by condition_grade query parameter."""
        response = client.get(
            f"{API_V1_STR}/materials/?condition_grade=상"
        )
        assert response.status_code == 200
        data = response.json()["data"]
        for m in data:
            assert m.get("condition_grade") == "상" or m.get("conditionGrade") == "상"

    def test_filter_by_location(self, client: TestClient):
        """Filter materials by location query parameter."""
        response = client.get(
            f"{API_V1_STR}/materials/?location=경기도"
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"

    def test_reserved_status_is_valid(
        self, client: TestClient, auth_headers: dict
    ):
        """RESERVED status should be accepted (MaterialStatus enum fix)."""
        response = client.patch(
            f"{API_V1_STR}/materials/{_phase1_material_id}/status",
            json={"status": "RESERVED"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "RESERVED"

        # Restore to ACTIVE
        client.patch(
            f"{API_V1_STR}/materials/{_phase1_material_id}/status",
            json={"status": "ACTIVE"},
            headers=auth_headers,
        )
