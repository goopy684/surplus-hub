from fastapi.testclient import TestClient
from app.core.config import settings

PREFIX = f"{settings.API_V1_STR}/events"


# ---------------------------------------------------------------------------
# Public access (no auth required)
# ---------------------------------------------------------------------------
class TestEventPublicAccess:
    """Events endpoints are fully public -- no auth required."""

    def test_list_events_public(self, client: TestClient):
        response = client.get(f"{PREFIX}/")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert isinstance(body["data"], list)

    def test_list_events_returns_meta(self, client: TestClient):
        response = client.get(f"{PREFIX}/")
        assert response.status_code == 200
        body = response.json()
        assert "meta" in body
        meta = body["meta"]
        assert "totalCount" in meta
        assert "page" in meta
        assert "limit" in meta
        assert "hasNextPage" in meta
        assert "totalPages" in meta

    def test_get_event_not_found(self, client: TestClient):
        response = client.get(f"{PREFIX}/99999")
        assert response.status_code == 404
        body = response.json()
        assert "detail" in body


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------
class TestEventPagination:
    """Events list supports page and limit query parameters."""

    def test_list_events_pagination_params(self, client: TestClient):
        response = client.get(f"{PREFIX}/", params={"page": 1, "limit": 5})
        assert response.status_code == 200
        body = response.json()
        assert body["meta"]["page"] == 1
        assert body["meta"]["limit"] == 5

    def test_list_events_second_page(self, client: TestClient):
        """Requesting page 2 when no events exist should return empty data."""
        response = client.get(f"{PREFIX}/", params={"page": 2, "limit": 10})
        assert response.status_code == 200
        body = response.json()
        assert isinstance(body["data"], list)


# ---------------------------------------------------------------------------
# Response shape validation
# ---------------------------------------------------------------------------
class TestEventResponseShape:
    """Validate that event list and detail responses have the correct structure."""

    def test_list_events_empty_db(self, client: TestClient):
        """With no seeded events, data should be an empty list and totalCount 0."""
        response = client.get(f"{PREFIX}/")
        assert response.status_code == 200
        body = response.json()
        assert body["data"] == []
        assert body["meta"]["totalCount"] == 0
        assert body["meta"]["hasNextPage"] is False
        assert body["meta"]["totalPages"] == 0

    def test_seed_events_and_get_detail(self, client: TestClient):
        """Seeding events populates 3 B2B promotions and allows detail lookup."""
        from app.crud.crud_event import crud_event
        from app.models.event import Event
        from app.tests.conftest import TestingSessionLocal

        db_session = TestingSessionLocal()
        try:
            seeded = crud_event.seed_events(db_session)
            assert len(seeded) == 3

            # Idempotent second call
            seeded_again = crud_event.seed_events(db_session)
            assert len(seeded_again) == 3

            list_resp = client.get(f"{PREFIX}/")
            assert list_resp.status_code == 200
            list_body = list_resp.json()
            assert list_body["meta"]["totalCount"] == 3

            first_id = list_body["data"][0]["id"]
            detail_resp = client.get(f"{PREFIX}/{first_id}")
            assert detail_resp.status_code == 200
            assert detail_resp.json()["data"]["id"] == first_id

            # Clean up seeded events so other tests see empty DB if needed
            db_session.query(Event).delete()
            db_session.commit()
        finally:
            db_session.close()
