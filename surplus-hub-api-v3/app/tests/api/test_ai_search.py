"""
Tests for GET /api/v1/ai/search (Hybrid Semantic Search).

All AI services are mocked since pgvector is not available in SQLite test DB.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

API_V1_STR = "/api/v1"


class TestSemanticSearch:
    """GET /api/v1/ai/search"""

    def test_search_missing_query_returns_422(self, client: TestClient):
        """Missing 'q' query parameter returns validation error."""
        response = client.get(f"{API_V1_STR}/ai/search")
        assert response.status_code == 422

    @patch("app.ai.services.search.log_search_query")
    @patch("app.ai.services.search.hybrid_search")
    def test_search_returns_empty_results(
        self, mock_search, mock_log, client: TestClient
    ):
        """Empty results when no materials match."""
        mock_search.return_value = ([], 0, "hybrid")

        response = client.get(f"{API_V1_STR}/ai/search?q=없는자재")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["data"] == []
        assert data["meta"]["totalCount"] == 0
        assert data["meta"]["searchMode"] == "hybrid"

    @patch("app.ai.services.search.log_search_query")
    @patch("app.ai.services.search.hybrid_search")
    def test_search_returns_results_with_scores(
        self, mock_search, mock_log, client: TestClient
    ):
        """Search returns results with score, vectorSimilarity, keywordScore."""
        mock_material = MagicMock()
        mock_material.id = 1
        mock_material.title = "H빔 잉여"
        mock_material.description = "건설현장 잉여 H빔 10개"
        mock_material.price = 100000
        mock_material.category = "철근"
        mock_material.thumbnail_url = None
        mock_material.location_address = "경기도 시흥시"  # 좌표 없이 주소만 있는 매물
        mock_material.location_lat = None
        mock_material.location_lng = None

        mock_search.return_value = (
            [
                {
                    "material": mock_material,
                    "score": 0.85,
                    "vector_similarity": 0.9,
                    "keyword_score": 1.0,
                    "distance_km": None,
                }
            ],
            1,
            "hybrid",
        )

        response = client.get(f"{API_V1_STR}/ai/search?q=H빔")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert len(data["data"]) == 1

        item = data["data"][0]
        assert item["id"] == 1
        assert item["title"] == "H빔 잉여"
        assert item["score"] == 0.85
        assert item["vectorSimilarity"] == 0.9
        assert item["keywordScore"] == 1.0
        # 좌표가 없어도 주소는 내려준다
        assert item["location"]["address"] == "경기도 시흥시"

        assert data["meta"]["totalCount"] == 1
        assert data["meta"]["page"] == 1
        assert data["meta"]["hasNextPage"] is False
        assert data["meta"]["searchMode"] == "hybrid"

    @patch("app.ai.services.search.log_search_query")
    @patch("app.ai.services.search.hybrid_search")
    def test_search_pagination(self, mock_search, mock_log, client: TestClient):
        """Pagination meta is correctly computed."""
        mock_search.return_value = ([], 50, "hybrid")

        response = client.get(f"{API_V1_STR}/ai/search?q=철근&page=1&limit=20")
        assert response.status_code == 200
        meta = response.json()["meta"]
        assert meta["totalCount"] == 50
        assert meta["hasNextPage"] is True

    @patch("app.ai.services.search.log_search_query")
    @patch("app.ai.services.search.hybrid_search")
    def test_search_with_category_filter(self, mock_search, mock_log, client: TestClient):
        """Category filter is passed to search service."""
        mock_search.return_value = ([], 0, "hybrid")

        response = client.get(
            f"{API_V1_STR}/ai/search?q=파이프&category=배관"
        )
        assert response.status_code == 200
        mock_search.assert_called_once()
        call_kwargs = mock_search.call_args
        assert call_kwargs.kwargs.get("category") == "배관" or call_kwargs[1].get("category") == "배관"
