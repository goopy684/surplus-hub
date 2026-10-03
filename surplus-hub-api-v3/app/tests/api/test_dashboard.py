"""Tests for admin dashboard statistics API: /api/v1/admin/dashboard/*

Scenarios:
  - MODERATOR gets summary -> 200 with all KPI fields
  - Non-admin gets summary -> 403
  - Stats endpoints with period=day/week/month -> 200
  - Stats with invalid period -> 422
  - Empty data -> returns 0s, no errors
  - Export CSV -> 200 with text/csv content type
  - MODERATOR export -> 403 (ADMIN+ required)
"""

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import create_access_token
from app.models.user import User
from app.crud.crud_dashboard import crud_dashboard

API_V1_STR = settings.API_V1_STR
DASHBOARD_PREFIX = f"{API_V1_STR}/admin/dashboard"

_NO_AUTH_CODES = (401, 403)

_EXPECTED_SUMMARY_KEYS = {
    "totalUsers",
    "activeUsers",
    "newUsersToday",
    "totalMaterials",
    "activeMaterials",
    "totalTransactions",
    "completedTransactions",
    "pendingReports",
}


# ---------------------------------------------------------------------------
# Session-scoped admin fixtures (reuse pattern from test_admin_roles.py)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def dashboard_moderator_user(db):
    user = User(
        email="dashboard_mod@example.com",
        hashed_password=None,
        name="Dashboard Moderator",
        is_active=True,
        is_superuser=False,
        admin_role="MODERATOR",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def dashboard_admin_user(db):
    user = User(
        email="dashboard_admin@example.com",
        hashed_password=None,
        name="Dashboard Admin",
        is_active=True,
        is_superuser=False,
        admin_role="ADMIN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def dashboard_moderator_headers(dashboard_moderator_user):
    token = create_access_token(subject=dashboard_moderator_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def dashboard_admin_headers(dashboard_admin_user):
    token = create_access_token(subject=dashboard_admin_user.id)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests: Summary endpoint
# ---------------------------------------------------------------------------


class TestDashboardSummary:
    def test_moderator_gets_summary_200(
        self, client: TestClient, dashboard_moderator_headers
    ):
        """MODERATOR는 summary 조회 가능."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/summary", headers=dashboard_moderator_headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        data = body["data"]
        for key in _EXPECTED_SUMMARY_KEYS:
            assert key in data, f"Missing key: {key}"

    def test_summary_values_are_non_negative(
        self, client: TestClient, dashboard_moderator_headers
    ):
        """모든 KPI 값은 0 이상이어야 함."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/summary", headers=dashboard_moderator_headers
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        for key in _EXPECTED_SUMMARY_KEYS:
            assert data[key] >= 0, f"{key} should be >= 0"

    def test_non_admin_gets_403(self, client: TestClient, auth_headers):
        """일반 사용자(admin_role=None)는 403."""
        resp = client.get(f"{DASHBOARD_PREFIX}/summary", headers=auth_headers)
        assert resp.status_code == 403

    def test_no_token_rejected(self, client: TestClient):
        resp = client.get(f"{DASHBOARD_PREFIX}/summary")
        assert resp.status_code in _NO_AUTH_CODES


# ---------------------------------------------------------------------------
# Tests: Stats endpoints
# ---------------------------------------------------------------------------


class TestDashboardStats:
    @pytest.mark.parametrize("period", ["day", "week", "month"])
    def test_user_stats_valid_period(
        self, client: TestClient, dashboard_moderator_headers, period
    ):
        """period=day/week/month -> 200."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/stats/users",
            params={"period": period},
            headers=dashboard_moderator_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "data" in body["data"]
        assert body["data"]["period"] == period

    def test_user_stats_invalid_period_422(
        self, client: TestClient, dashboard_moderator_headers
    ):
        """유효하지 않은 period -> 422."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/stats/users",
            params={"period": "invalid"},
            headers=dashboard_moderator_headers,
        )
        assert resp.status_code == 422

    @pytest.mark.parametrize("period", ["day", "week", "month"])
    def test_material_stats_valid_period(
        self, client: TestClient, dashboard_moderator_headers, period
    ):
        resp = client.get(
            f"{DASHBOARD_PREFIX}/stats/materials",
            params={"period": period},
            headers=dashboard_moderator_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["period"] == period

    def test_material_stats_invalid_period_422(
        self, client: TestClient, dashboard_moderator_headers
    ):
        resp = client.get(
            f"{DASHBOARD_PREFIX}/stats/materials",
            params={"period": "yearly"},
            headers=dashboard_moderator_headers,
        )
        assert resp.status_code == 422

    @pytest.mark.parametrize("period", ["day", "week", "month"])
    def test_transaction_stats_valid_period(
        self, client: TestClient, dashboard_moderator_headers, period
    ):
        resp = client.get(
            f"{DASHBOARD_PREFIX}/stats/transactions",
            params={"period": period},
            headers=dashboard_moderator_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["data"]["period"] == period

    def test_transaction_stats_invalid_period_422(
        self, client: TestClient, dashboard_moderator_headers
    ):
        resp = client.get(
            f"{DASHBOARD_PREFIX}/stats/transactions",
            params={"period": "quarterly"},
            headers=dashboard_moderator_headers,
        )
        assert resp.status_code == 422

    def test_stats_empty_data_returns_empty_list(
        self, client: TestClient, dashboard_moderator_headers
    ):
        """데이터가 없어도 에러 없이 빈 리스트 반환."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/stats/users",
            params={"period": "day", "days": 1},
            headers=dashboard_moderator_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]["data"]
        assert isinstance(data, list)

    def test_stats_days_out_of_range_422(
        self, client: TestClient, dashboard_moderator_headers
    ):
        """days=0 또는 days>365 -> 422."""
        for invalid_days in [0, 366]:
            resp = client.get(
                f"{DASHBOARD_PREFIX}/stats/users",
                params={"period": "day", "days": invalid_days},
                headers=dashboard_moderator_headers,
            )
            assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Tests: Export CSV
# ---------------------------------------------------------------------------


class TestDashboardExport:
    @pytest.mark.parametrize("export_type", ["users", "materials", "transactions"])
    def test_admin_export_csv_200(
        self, client: TestClient, dashboard_admin_headers, export_type
    ):
        """ADMIN은 CSV export 가능, content-type=text/csv."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/export/{export_type}",
            headers=dashboard_admin_headers,
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    def test_moderator_export_gets_403(
        self, client: TestClient, dashboard_moderator_headers
    ):
        """MODERATOR는 export 불가 (ADMIN+ 필요)."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/export/users",
            headers=dashboard_moderator_headers,
        )
        assert resp.status_code == 403

    def test_non_admin_export_gets_403(self, client: TestClient, auth_headers):
        """일반 사용자는 export 불가."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/export/users", headers=auth_headers
        )
        assert resp.status_code == 403

    def test_invalid_export_type_400(
        self, client: TestClient, dashboard_admin_headers
    ):
        """유효하지 않은 export_type -> 400."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/export/invalid_type",
            headers=dashboard_admin_headers,
        )
        assert resp.status_code == 400

    def test_export_csv_has_header_row(
        self, client: TestClient, dashboard_admin_headers
    ):
        """CSV 응답은 헤더 행을 포함해야 함."""
        resp = client.get(
            f"{DASHBOARD_PREFIX}/export/users",
            headers=dashboard_admin_headers,
        )
        assert resp.status_code == 200
        content = resp.text
        first_line = content.splitlines()[0] if content.strip() else ""
        # users CSV header contains 'id' and 'email'
        assert "id" in first_line
        assert "email" in first_line

# ---------------------------------------------------------------------------
# Tests: period bucketing (day/week/month) — the actual aggregation logic
# ---------------------------------------------------------------------------


class _Row:
    """Mimics a SQLAlchemy result row with .date / .count attributes."""

    def __init__(self, date_str, count):
        self.date = date_str
        self.count = count


class TestBucketRows:
    def test_day_period_passes_through(self):
        rows = [_Row("2026-07-14", 2), _Row("2026-07-15", 3)]
        out = crud_dashboard._bucket_rows(rows, "day")
        assert out == [
            {"date": "2026-07-14", "count": 2},
            {"date": "2026-07-15", "count": 3},
        ]

    def test_week_period_collapses_to_monday_and_sums(self):
        # 07-14 (Tue) and 07-15 (Wed) share the ISO week starting Mon 07-13;
        # 07-20 is the next Monday -> its own bucket.
        rows = [_Row("2026-07-14", 2), _Row("2026-07-15", 3), _Row("2026-07-20", 5)]
        out = crud_dashboard._bucket_rows(rows, "week")
        assert out == [
            {"date": "2026-07-13", "count": 5},
            {"date": "2026-07-20", "count": 5},
        ]

    def test_month_period_collapses_to_first_and_sums(self):
        rows = [_Row("2026-07-15", 2), _Row("2026-07-31", 4), _Row("2026-08-02", 1)]
        out = crud_dashboard._bucket_rows(rows, "month")
        assert out == [
            {"date": "2026-07-01", "count": 6},
            {"date": "2026-08-01", "count": 1},
        ]

    def test_output_is_sorted_chronologically(self):
        rows = [_Row("2026-08-02", 1), _Row("2026-07-15", 2)]
        out = crud_dashboard._bucket_rows(rows, "month")
        assert [r["date"] for r in out] == ["2026-07-01", "2026-08-01"]

    def test_empty_rows_returns_empty_list(self):
        assert crud_dashboard._bucket_rows([], "week") == []

    def test_accepts_datetime_string_with_time_component(self):
        # SQLite's func.date() yields 'YYYY-MM-DD', but guard against a full
        # timestamp string sneaking through.
        rows = [_Row("2026-07-15 12:34:56", 2)]
        out = crud_dashboard._bucket_rows(rows, "month")
        assert out == [{"date": "2026-07-01", "count": 2}]
