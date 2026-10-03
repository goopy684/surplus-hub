"""
Tests for /api/v1/categories/ endpoints.

The categories endpoint is public (no auth required).
On first call, if no categories exist, the endpoint seeds default categories
automatically via crud_category.seed_categories().
"""

import pytest
from fastapi.testclient import TestClient

API_V1_STR = "/api/v1"


class TestListCategories:
    """GET /api/v1/categories/"""

    def test_list_categories_returns_200(self, client: TestClient):
        """Public endpoint should always return 200."""
        response = client.get(f"{API_V1_STR}/categories/")
        assert response.status_code == 200

    def test_list_categories_response_structure(self, client: TestClient):
        """Response follows the standard envelope: status + data."""
        response = client.get(f"{API_V1_STR}/categories/")
        body = response.json()

        assert body["status"] == "success"
        assert "data" in body
        assert isinstance(body["data"], list)

    def test_list_categories_auto_seeds_defaults(self, client: TestClient):
        """The endpoint seeds default 업종별 categories when none exist.
        After seeding, at least the 6 default categories should be present."""
        response = client.get(f"{API_V1_STR}/categories/")
        body = response.json()
        categories = body["data"]

        # The seed_categories() method creates 6 default 업종별 categories
        # (조명/문창호/건축자재/전기/설비/기타)
        assert len(categories) >= 6

    def test_list_categories_contains_expected_names(self, client: TestClient):
        """Verify default 업종별 category names are present."""
        response = client.get(f"{API_V1_STR}/categories/")
        categories = response.json()["data"]
        names = [c["name"] for c in categories]

        expected_names = ["조명", "문/창호", "건축자재", "전기", "설비", "기타"]
        for name in expected_names:
            assert name in names, f"Expected category '{name}' not found"

    def test_list_categories_item_structure(self, client: TestClient):
        """Each category object should have the expected fields."""
        response = client.get(f"{API_V1_STR}/categories/")
        categories = response.json()["data"]

        assert len(categories) > 0
        first = categories[0]

        assert "id" in first
        assert "name" in first
        assert "icon" in first
        assert isinstance(first["id"], int)
        assert isinstance(first["name"], str)

    def test_list_categories_ordered_by_display_order(self, client: TestClient):
        """Categories should come back sorted by display_order."""
        response = client.get(f"{API_V1_STR}/categories/")
        categories = response.json()["data"]

        # The displayOrder alias or display_order field should be monotonically
        # non-decreasing. The schema uses alias "displayOrder".
        orders = []
        for c in categories:
            # The field may be serialized as displayOrder (alias) or display_order
            order = c.get("displayOrder", c.get("display_order", 0))
            orders.append(order)

        assert orders == sorted(orders), "Categories are not sorted by display order"

    def test_list_categories_idempotent(self, client: TestClient):
        """Calling the endpoint twice should return the same data
        (seed_categories checks for existing records before inserting)."""
        response1 = client.get(f"{API_V1_STR}/categories/")
        response2 = client.get(f"{API_V1_STR}/categories/")

        data1 = response1.json()["data"]
        data2 = response2.json()["data"]

        assert len(data1) == len(data2)
        ids1 = [c["id"] for c in data1]
        ids2 = [c["id"] for c in data2]
        assert ids1 == ids2

    def test_list_categories_no_auth_required(self, client: TestClient):
        """Explicitly verify no auth header is needed."""
        response = client.get(
            f"{API_V1_STR}/categories/",
            headers={},  # no Authorization header
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"
