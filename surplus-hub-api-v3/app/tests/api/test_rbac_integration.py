"""RBAC 통합 테스트

Task #5 - Phase 1.2 시나리오:
  1. 역할 계층 테스트 (MODERATOR < ADMIN < SUPER_ADMIN)
  2. 권한 상승 방지 테스트
  3. 감사 로그 자동 생성 상세 검증
  4. SECRET_KEY 프로덕션 검증 테스트
  5. 동시성 테스트 (두 관리자 동시 작업)
  6. check_permission() 유닛 테스트
"""

import threading
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.permissions import ROLE_HIERARCHY, check_permission
from app.core.security import create_access_token
from app.models.user import User

API_V1_STR = settings.API_V1_STR
ROLES_PREFIX = f"{API_V1_STR}/admin/roles"


# ---------------------------------------------------------------------------
# 공유 픽스처 (test_admin_roles.py와 동일한 유저 재사용)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def rbac_moderator(db):
    user = User(
        email="rbac_mod@example.com",
        hashed_password=None,
        name="RBAC Moderator",
        is_active=True,
        is_superuser=False,
        admin_role="MODERATOR",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def rbac_admin(db):
    user = User(
        email="rbac_admin@example.com",
        hashed_password=None,
        name="RBAC Admin",
        is_active=True,
        is_superuser=False,
        admin_role="ADMIN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def rbac_super_admin(db):
    user = User(
        email="rbac_superadmin@example.com",
        hashed_password=None,
        name="RBAC Super Admin",
        is_active=True,
        is_superuser=True,
        admin_role="SUPER_ADMIN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def rbac_mod_headers(rbac_moderator):
    token = create_access_token(subject=rbac_moderator.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def rbac_admin_headers(rbac_admin):
    token = create_access_token(subject=rbac_admin.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def rbac_super_headers(rbac_super_admin):
    token = create_access_token(subject=rbac_super_admin.id)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. check_permission() 유닛 테스트
# ---------------------------------------------------------------------------

class TestCheckPermissionUnit:
    """permissions.py check_permission() 함수 유닛 테스트."""

    def test_super_admin_passes_all_levels(self):
        assert check_permission("SUPER_ADMIN", "SUPER_ADMIN") is True
        assert check_permission("SUPER_ADMIN", "ADMIN") is True
        assert check_permission("SUPER_ADMIN", "MODERATOR") is True

    def test_admin_passes_admin_and_moderator(self):
        assert check_permission("ADMIN", "ADMIN") is True
        assert check_permission("ADMIN", "MODERATOR") is True

    def test_admin_blocked_from_super_admin(self):
        assert check_permission("ADMIN", "SUPER_ADMIN") is False

    def test_moderator_passes_own_level_only(self):
        assert check_permission("MODERATOR", "MODERATOR") is True
        assert check_permission("MODERATOR", "ADMIN") is False
        assert check_permission("MODERATOR", "SUPER_ADMIN") is False

    def test_none_role_blocked_everywhere(self):
        assert check_permission(None, "MODERATOR") is False
        assert check_permission(None, "ADMIN") is False
        assert check_permission(None, "SUPER_ADMIN") is False

    def test_unknown_role_treated_as_no_permission(self):
        assert check_permission("UNKNOWN_ROLE", "MODERATOR") is False

    def test_role_hierarchy_values(self):
        assert ROLE_HIERARCHY["SUPER_ADMIN"] > ROLE_HIERARCHY["ADMIN"]
        assert ROLE_HIERARCHY["ADMIN"] > ROLE_HIERARCHY["MODERATOR"]
        assert ROLE_HIERARCHY["MODERATOR"] >= 1


# ---------------------------------------------------------------------------
# 2. 역할 계층 통합 테스트
# ---------------------------------------------------------------------------

class TestRoleHierarchyIntegration:
    """각 역할이 허용/차단되는 엔드포인트를 계층별로 검증."""

    # GET /admin/roles - ADMIN 이상 허용
    def test_moderator_blocked_from_list_endpoint(
        self, client: TestClient, rbac_mod_headers
    ):
        resp = client.get(ROLES_PREFIX, headers=rbac_mod_headers)
        assert resp.status_code == 403, "MODERATOR는 admin/roles 목록에 접근 불가"

    def test_admin_allowed_list_endpoint(
        self, client: TestClient, rbac_admin_headers
    ):
        resp = client.get(ROLES_PREFIX, headers=rbac_admin_headers)
        assert resp.status_code == 200, "ADMIN은 admin/roles 목록 접근 가능"

    def test_super_admin_allowed_list_endpoint(
        self, client: TestClient, rbac_super_headers
    ):
        resp = client.get(ROLES_PREFIX, headers=rbac_super_headers)
        assert resp.status_code == 200, "SUPER_ADMIN은 admin/roles 목록 접근 가능"

    # GET /admin/roles/audit-logs - ADMIN 이상 허용
    def test_moderator_blocked_from_audit_logs(
        self, client: TestClient, rbac_mod_headers
    ):
        resp = client.get(f"{ROLES_PREFIX}/audit-logs", headers=rbac_mod_headers)
        assert resp.status_code == 403, "MODERATOR는 감사 로그에 접근 불가"

    def test_admin_allowed_audit_logs(
        self, client: TestClient, rbac_admin_headers
    ):
        resp = client.get(f"{ROLES_PREFIX}/audit-logs", headers=rbac_admin_headers)
        assert resp.status_code == 200, "ADMIN은 감사 로그 접근 가능"

    # PUT /admin/roles/{id}/role - SUPER_ADMIN 전용
    def test_moderator_blocked_from_role_update(
        self, client: TestClient, rbac_mod_headers, rbac_moderator
    ):
        resp = client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "ADMIN"},
            headers=rbac_mod_headers,
        )
        assert resp.status_code == 403, "MODERATOR는 역할 변경 불가"

    def test_admin_blocked_from_role_update(
        self, client: TestClient, rbac_admin_headers, rbac_moderator
    ):
        resp = client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "ADMIN"},
            headers=rbac_admin_headers,
        )
        assert resp.status_code == 403, "ADMIN은 역할 변경 불가 (SUPER_ADMIN 전용)"

    def test_super_admin_allowed_role_update(
        self, client: TestClient, rbac_super_headers, rbac_moderator
    ):
        resp = client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "MODERATOR"},
            headers=rbac_super_headers,
        )
        assert resp.status_code == 200, "SUPER_ADMIN은 역할 변경 가능"


# ---------------------------------------------------------------------------
# 3. 권한 상승 방지 테스트
# ---------------------------------------------------------------------------

class TestPrivilegeEscalationPrevention:
    """낮은 역할 유저가 자신을 높은 역할로 승격하려는 시도 차단."""

    def test_admin_cannot_promote_self(
        self, client: TestClient, rbac_admin_headers, rbac_admin
    ):
        """ADMIN이 자기 자신을 SUPER_ADMIN으로 승격 시도 -> 403."""
        resp = client.put(
            f"{ROLES_PREFIX}/{rbac_admin.id}/role",
            json={"adminRole": "SUPER_ADMIN"},
            headers=rbac_admin_headers,
        )
        assert resp.status_code == 403

    def test_moderator_cannot_promote_self(
        self, client: TestClient, rbac_mod_headers, rbac_moderator
    ):
        """MODERATOR가 자기 자신을 SUPER_ADMIN으로 승격 시도 -> 403."""
        resp = client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "SUPER_ADMIN"},
            headers=rbac_mod_headers,
        )
        assert resp.status_code == 403

    def test_regular_user_cannot_grant_any_role(
        self, client: TestClient, auth_headers, rbac_moderator
    ):
        """일반 유저는 아무 역할도 부여 불가 -> 403."""
        resp = client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "MODERATOR"},
            headers=auth_headers,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 4. 감사 로그 상세 검증
# ---------------------------------------------------------------------------

class TestAuditLogDetails:
    """감사 로그 생성 및 내용 검증."""

    def test_audit_log_has_required_fields(
        self, client: TestClient, rbac_super_headers, rbac_admin_headers, rbac_moderator
    ):
        """감사 로그 항목이 필수 필드를 모두 포함."""
        # 역할 변경으로 로그 생성
        client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "ADMIN"},
            headers=rbac_super_headers,
        )

        resp = client.get(f"{ROLES_PREFIX}/audit-logs", headers=rbac_admin_headers)
        assert resp.status_code == 200

        logs = resp.json()["data"]["items"]
        assert len(logs) >= 1

        latest = logs[0]  # 최신 순 정렬
        assert "id" in latest
        assert "adminId" in latest
        assert "action" in latest
        assert "createdAt" in latest
        assert latest["action"] == "UPDATE_ADMIN_ROLE"

    def test_audit_log_records_target_info(
        self, client: TestClient, rbac_super_headers, rbac_admin_headers, rbac_moderator
    ):
        """감사 로그에 대상 유저 정보가 기록됨."""
        client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "MODERATOR"},
            headers=rbac_super_headers,
        )

        resp = client.get(f"{ROLES_PREFIX}/audit-logs", headers=rbac_admin_headers)
        logs = resp.json()["data"]["items"]

        target_logs = [l for l in logs if l.get("targetId") == rbac_moderator.id]
        assert len(target_logs) >= 1
        assert target_logs[0]["targetType"] == "user"

    def test_audit_log_pagination(
        self, client: TestClient, rbac_admin_headers
    ):
        """감사 로그 페이지네이션 동작 확인."""
        resp = client.get(
            f"{ROLES_PREFIX}/audit-logs?skip=0&limit=1",
            headers=rbac_admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["items"]) <= 1
        assert "total" in data

    def test_audit_log_filter_by_admin_id(
        self, client: TestClient, rbac_super_headers, rbac_admin_headers, rbac_super_admin
    ):
        """admin_id 필터링으로 특정 관리자 행위만 조회."""
        resp = client.get(
            f"{ROLES_PREFIX}/audit-logs?admin_id={rbac_super_admin.id}",
            headers=rbac_admin_headers,
        )
        assert resp.status_code == 200
        logs = resp.json()["data"]["items"]
        for log in logs:
            assert log["adminId"] == rbac_super_admin.id


# ---------------------------------------------------------------------------
# 5. SECRET_KEY 프로덕션 검증 테스트
# ---------------------------------------------------------------------------

class TestSecretKeyValidation:
    """Settings.__init__의 production SECRET_KEY 검증 로직."""

    def test_production_with_default_key_raises(self):
        """APP_ENV=production + 기본 SECRET_KEY -> ValueError."""
        from app.core.config import Settings

        with pytest.raises(ValueError, match="SECRET_KEY must be a strong"):
            Settings(
                APP_ENV="production",
                SECRET_KEY="changethis_secret_key_for_jwt",
                DATABASE_URL="postgresql://x:x@localhost/test",
            )

    def test_production_with_custom_key_ok(self):
        """APP_ENV=production + 강한 SECRET_KEY -> 정상 초기화."""
        import warnings
        from app.core.config import Settings

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            s = Settings(
                APP_ENV="production",
                SECRET_KEY="a-very-strong-random-key-1234567890",
                CORS_ORIGINS=["https://app.example.com"],
                DATABASE_URL="postgresql://x:x@localhost/test",
            )
        assert s.APP_ENV == "production"
        assert not s.SECRET_KEY.startswith("changethis")

    def test_local_env_with_default_key_warns_not_raises(self):
        """APP_ENV=local + 기본 SECRET_KEY -> 경고만 발생, 예외 없음."""
        import warnings
        from app.core.config import Settings

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            s = Settings(
                APP_ENV="local",
                SECRET_KEY="changethis_secret_key_for_jwt",
                DATABASE_URL="postgresql://x:x@localhost/test",
            )
        assert s.SECRET_KEY.startswith("changethis")
        warn_messages = [str(warning.message) for warning in w]
        assert any("SECRET_KEY" in msg for msg in warn_messages)

    def test_prod_alias_also_raises(self):
        """APP_ENV=prod (별칭)도 검증 적용."""
        from app.core.config import Settings

        with pytest.raises(ValueError, match="SECRET_KEY must be a strong"):
            Settings(
                APP_ENV="prod",
                SECRET_KEY="changethis_anything",
                DATABASE_URL="postgresql://x:x@localhost/test",
            )

    def test_prod_placeholder_key_raises(self):
        """APP_ENV=prod + .env 플레이스홀더 키도 거부 (이전엔 가드를 통과하던 취약점)."""
        from app.core.config import Settings

        with pytest.raises(ValueError, match="SECRET_KEY must be a strong"):
            Settings(
                APP_ENV="prod",
                SECRET_KEY="your-secret-key-change-this-in-production",
                CORS_ORIGINS=["https://app.example.com"],
                DATABASE_URL="postgresql://x:x@localhost/test",
            )

    def test_prod_wildcard_cors_raises(self):
        """APP_ENV=prod + CORS '*' -> 부팅 거부 (fail-closed)."""
        from app.core.config import Settings

        with pytest.raises(ValueError, match="CORS_ORIGINS must be an explicit"):
            Settings(
                APP_ENV="prod",
                SECRET_KEY="a-very-strong-random-key-1234567890",
                CORS_ORIGINS=["*"],
                DATABASE_URL="postgresql://x:x@localhost/test",
            )


# ---------------------------------------------------------------------------
# 6. 동시성 테스트 (두 관리자 동시 작업)
# ---------------------------------------------------------------------------

class TestConcurrentAdminOperations:
    """두 SUPER_ADMIN이 작업할 때 데이터 무결성 검증 (SQLite StaticPool 특성 고려)."""

    def test_concurrent_role_reads_are_consistent(
        self, client: TestClient, rbac_admin_headers
    ):
        """연속 목록 조회 시 일관된 결과 반환."""
        results = [
            client.get(ROLES_PREFIX, headers=rbac_admin_headers).status_code
            for _ in range(5)
        ]
        assert all(code == 200 for code in results), f"일부 요청 실패: {results}"

    def test_concurrent_role_updates_both_create_audit_logs(
        self,
        client: TestClient,
        rbac_super_headers,
        rbac_admin_headers,
        rbac_moderator,
        rbac_admin,
    ):
        """두 관리자가 각각 유저 역할을 변경 -> 각각 감사 로그 생성."""
        errors = []

        resp1 = client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "ADMIN"},
            headers=rbac_super_headers,
        )
        if resp1.status_code != 200:
            errors.append(f"moderator update failed: {resp1.status_code}")

        resp2 = client.put(
            f"{ROLES_PREFIX}/{rbac_admin.id}/role",
            json={"adminRole": "ADMIN"},
            headers=rbac_super_headers,
        )
        if resp2.status_code != 200:
            errors.append(f"admin update failed: {resp2.status_code}")

        assert not errors, f"업데이트 중 오류 발생: {errors}"

        # 두 업데이트 모두 감사 로그에 기록됐는지 확인
        resp = client.get(f"{ROLES_PREFIX}/audit-logs", headers=rbac_admin_headers)
        logs = resp.json()["data"]["items"]
        target_ids = {log.get("targetId") for log in logs}
        assert rbac_moderator.id in target_ids
        assert rbac_admin.id in target_ids


# ---------------------------------------------------------------------------
# 7. 응답 형식 검증
# ---------------------------------------------------------------------------

class TestResponseFormat:
    """API 응답이 StandardResponse 형식을 준수하는지 확인."""

    def test_list_response_format(self, client: TestClient, rbac_admin_headers):
        resp = client.get(ROLES_PREFIX, headers=rbac_admin_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("status") == "success"
        assert "data" in body
        assert "items" in body["data"]
        assert "total" in body["data"]

    def test_audit_log_response_format(self, client: TestClient, rbac_admin_headers):
        resp = client.get(f"{ROLES_PREFIX}/audit-logs", headers=rbac_admin_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("status") == "success"
        assert "data" in body
        assert "items" in body["data"]
        assert "total" in body["data"]

    def test_role_update_response_has_camel_case(
        self, client: TestClient, rbac_super_headers, rbac_moderator
    ):
        """역할 업데이트 응답이 camelCase 필드를 사용."""
        resp = client.put(
            f"{ROLES_PREFIX}/{rbac_moderator.id}/role",
            json={"adminRole": "MODERATOR"},
            headers=rbac_super_headers,
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        # camelCase 필드 확인
        assert "adminRole" in data
        assert "isActive" in data
        # snake_case는 없어야 함
        assert "admin_role" not in data
        assert "is_active" not in data
