"""모듈 0 · 처분 경로 판별 게이트 (SH-48).

POST /api/v1/ai/evaluate-disposal, PATCH /api/v1/ai/disposal-advisories/{id},
POST /api/v1/materials/ 의 advisoryId 가드레일. SQLite 키워드 폴백 경로로 돈다.
"""

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.ai.services.disposal_gate import (
    MarketEvidence,
    decide_route,
    infer_disposal_signals,
)
from app.models.disposal_advisory import DisposalAdvisory
from app.models.material import Material
from app.models.transaction import Transaction

API = "/api/v1"


def _token() -> str:
    """다른 테스트 매물과 겹치지 않는 영문 토큰 (키워드 매칭 격리용, 숫자 없이 글자만)."""
    return "Zq" + "".join(chr(97 + int(c, 16)) for c in uuid.uuid4().hex[:8])


def _evaluate(client, headers, **body):
    r = client.post(f"{API}/ai/evaluate-disposal", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def _material_payload(**extra):
    return {
        "title": "게이트 통과 자재",
        "description": "설명",
        "price": 10000,
        "location": {"address": "서울시 강남구"},
        **extra,
    }


# ===== 순수 규칙 =====


class TestSignals:
    def test_mixed_waste_keyword_forces_severe(self):
        assert infer_disposal_signals(["철거 잔해 일괄"]) == ("SEVERE", True, None)

    def test_severe_keyword(self):
        damage, mixed, _ = infer_disposal_signals(["깨진 타일 30장"], "NONE")
        assert (damage, mixed) == ("SEVERE", False)

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("알루미늄 창호 프레임", "알루미늄"),
            ("F-CV 케이블 잔량", "구리/전선"),
            ("SUS304 배관 25A", "스테인리스"),
            ("아시바 클램프", "고철/강재"),
            ("석고보드 9.5T", None),
        ],
    )
    def test_recyclable_keyword(self, text, expected):
        assert infer_disposal_signals([text])[2] == expected

    def test_invalid_vision_values_are_normalized(self):
        assert infer_disposal_signals(["석고보드"], "terrible", False, "플라스틱") == ("NONE", False, None)

    def test_vision_material_wins_over_keyword(self):
        assert infer_disposal_signals(["창호"], None, False, "구리/전선")[2] == "구리/전선"


class TestDecideRoute:
    NONE = MarketEvidence(total_market_count=10)
    SOME = MarketEvidence(similar_active_count=2, similar_sold_count=1, completed_trade_count=1, total_market_count=10)
    EMPTY_DB = MarketEvidence()

    @pytest.mark.parametrize(
        "condition,damage,mixed,recyclable,market,route,can_override",
        [
            ("상", "NONE", True, None, SOME, "SCRAP", False),  # Rule 1
            ("상", "SEVERE", False, "알루미늄", SOME, "SCRAP", True),  # Rule 2
            ("하", "NONE", False, "알루미늄", NONE, "RECYCLE", True),  # Rule 3
            ("하", "NONE", False, None, NONE, "SCRAP", True),  # Rule 4
            ("하", "NONE", False, None, SOME, "RECYCLE", True),  # Rule 5
            ("중", "NONE", False, "고철/강재", SOME, "REUSE", True),  # Rule 6
            ("중", "NONE", False, "고철/강재", NONE, "RECYCLE", True),  # Rule 7 (소재 가치)
            (None, "MINOR", False, None, NONE, "RECYCLE", True),  # Rule 7 (경미 손상)
            ("상", "NONE", False, "알루미늄", NONE, "REUSE", True),  # Rule 8 (신품급)
            ("중", "NONE", False, "고철/강재", EMPTY_DB, "REUSE", True),  # Rule 8 (Cold-Start)
        ],
    )
    def test_matrix(self, condition, damage, mixed, recyclable, market, route, can_override):
        got_route, got_override, reasoning = decide_route(condition, damage, mixed, recyclable, market)
        assert (got_route, got_override) == (route, can_override)
        assert reasoning

    def test_cold_start_reasoning_reports_real_zero_counts(self):
        _, _, reasoning = decide_route("상", "NONE", False, None, self.EMPTY_DB)
        assert "유사 매물 0건" in reasoning and "체결 실적 0건" in reasoning


# ===== analyze-image 확장 필드 =====


class TestAnalyzeImageSignals:
    @patch("app.ai.services.registration.analyze_image")
    def test_returns_disposal_signals(self, mock_vision, client: TestClient, auth_headers: dict):
        mock_vision.return_value = {
            "category": "문/창호",
            "tags": ["샷시", "철거"],
            "title_suggestion": "알루미늄 샷시",
            "condition": "하",
            "material_type": "알루미늄 창호",
            "confidence": 0.8,
            "damage_level": "minor",
            "is_mixed_waste": False,
            "recyclable_material": None,
        }
        r = client.post(
            f"{API}/ai/analyze-image", json={"imageUrl": "https://example.com/a.jpg"}, headers=auth_headers
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["damageLevel"] == "MINOR"
        assert data["isMixedWaste"] is False
        assert data["recyclableMaterial"] == "알루미늄"
        # 기존 필드 유지
        assert data["category"] == "문/창호" and data["condition"] == "하"

    @patch("app.ai.services.registration.analyze_image")
    def test_legacy_vision_output_defaults(self, mock_vision, client: TestClient, auth_headers: dict):
        mock_vision.return_value = {"category": "기타", "tags": [], "title_suggestion": "석고보드", "condition": "상"}
        r = client.post(
            f"{API}/ai/analyze-image", json={"imageUrl": "https://example.com/b.jpg"}, headers=auth_headers
        )
        data = r.json()["data"]
        assert (data["damageLevel"], data["isMixedWaste"], data["recyclableMaterial"]) == ("NONE", False, None)


# ===== evaluate-disposal =====


class TestEvaluateDisposal:
    def test_requires_auth(self, client: TestClient):
        r = client.post(f"{API}/ai/evaluate-disposal", json={"title": "x"})
        assert r.status_code == 401

    def test_reuse_counts_real_similar_listings_and_trades(
        self, client: TestClient, auth_headers: dict, db, test_user, test_user2
    ):
        token = _token()
        active = Material(title=f"{token} 배관", description="d", price=1, location_address="a",
                          status="ACTIVE", seller_id=test_user2.id)
        sold = Material(title=f"{token} 배관 잔량", description="d", price=1, location_address="a",
                        status="SOLD", seller_id=test_user2.id)
        hidden = Material(title=f"{token} 숨김", description="d", price=1, location_address="a",
                          status="HIDDEN", seller_id=test_user2.id)
        db.add_all([active, sold, hidden])
        db.flush()
        db.add_all([
            Transaction(material_id=sold.id, seller_id=test_user2.id, buyer_id=test_user.id, price=1, status="COMPLETED"),
            Transaction(material_id=active.id, seller_id=test_user2.id, buyer_id=test_user.id, price=1, status="CANCELLED"),
        ])
        db.commit()

        data = _evaluate(client, auth_headers, title=f"{token} 신품", condition="중", category="설비")
        assert data["recommendedRoute"] == "REUSE"
        assert data["selectedRoute"] == "REUSE"
        ev = data["evidence"]
        assert (ev["similarActiveCount"], ev["similarSoldCount"], ev["completedTradeCount"]) == (1, 1, 1)
        assert "유사 매물 2건" in data["reasoning"] and "체결 실적 1건" in data["reasoning"]
        assert data["steps"] == [] and data["channels"] == []

        saved = db.get(DisposalAdvisory, data["advisoryId"])
        assert saved.user_id == test_user.id
        assert saved.similar_sold_count == 1 and saved.material_id is None

    def test_recycle_low_grade_aluminum_with_guide(self, client: TestClient, auth_headers: dict):
        data = _evaluate(client, auth_headers, title=f"{_token()} 알루미늄 샷시", condition="하")
        assert data["recommendedRoute"] == "RECYCLE"
        assert data["evidence"]["recyclableMaterial"] == "알루미늄"
        assert data["canOverrideToReuse"] is True
        assert any(c["url"] == "https://www.re.or.kr" for c in data["channels"])
        assert len(data["steps"]) == 3

    def test_scrap_mixed_waste_blocks_reuse(self, client: TestClient, auth_headers: dict):
        data = _evaluate(client, auth_headers, title=f"{_token()} 철거 잔해", isMixedWaste=True)
        assert data["recommendedRoute"] == "SCRAP"
        assert data["canOverrideToReuse"] is False
        assert data["evidence"]["isMixedWaste"] is True
        assert any(c["url"] == "https://www.allbaro.or.kr" for c in data["channels"])

    def test_scrap_severe_damage(self, client: TestClient, auth_headers: dict):
        data = _evaluate(client, auth_headers, title=f"{_token()} 타일", condition="중", damageLevel="SEVERE")
        assert data["recommendedRoute"] == "SCRAP"
        assert data["canOverrideToReuse"] is True


# ===== 재지정 =====


class TestOverride:
    def _patch(self, client, headers, advisory_id, **body):
        return client.patch(f"{API}/ai/disposal-advisories/{advisory_id}", json=body, headers=headers)

    def test_recycle_to_reuse(self, client: TestClient, auth_headers: dict, db):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 알루미늄 창호", condition="하")
        r = self._patch(client, auth_headers, adv["advisoryId"], selectedRoute="REUSE")
        assert r.status_code == 200
        data = r.json()["data"]
        assert (data["recommendedRoute"], data["selectedRoute"]) == ("RECYCLE", "REUSE")
        assert data["headline"] == "직거래 등록 가능"
        db.expire_all()
        assert db.get(DisposalAdvisory, adv["advisoryId"]).selected_route == "REUSE"

    def test_other_user_forbidden(self, client: TestClient, auth_headers: dict, auth_headers2: dict):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 알루미늄", condition="하")
        assert self._patch(client, auth_headers2, adv["advisoryId"], selectedRoute="REUSE").status_code == 403

    def test_not_found(self, client: TestClient, auth_headers: dict):
        assert self._patch(client, auth_headers, 999999, selectedRoute="REUSE").status_code == 404

    def test_mixed_waste_reuse_rejected(self, client: TestClient, auth_headers: dict):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 혼합폐기물")
        r = self._patch(client, auth_headers, adv["advisoryId"], selectedRoute="REUSE", overrideReason="본품 양호")
        assert r.status_code == 422

    def test_scrap_to_reuse_needs_reason(self, client: TestClient, auth_headers: dict):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 파손품")
        assert self._patch(client, auth_headers, adv["advisoryId"], selectedRoute="REUSE").status_code == 422
        assert self._patch(
            client, auth_headers, adv["advisoryId"], selectedRoute="REUSE", overrideReason="   "
        ).status_code == 422
        r = self._patch(
            client, auth_headers, adv["advisoryId"], selectedRoute="REUSE", overrideReason="외포장 손상(내부 자재 정상)"
        )
        assert r.status_code == 200
        assert r.json()["data"]["overrideReason"] == "외포장 손상(내부 자재 정상)"

    def test_invalid_route_rejected(self, client: TestClient, auth_headers: dict):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 자재")
        assert self._patch(client, auth_headers, adv["advisoryId"], selectedRoute="SELL").status_code == 422


# ===== POST /materials/ 가드레일 =====


class TestMaterialCreateGuardrail:
    def _create(self, client, headers, **extra):
        return client.post(f"{API}/materials/", json=_material_payload(**extra), headers=headers)

    def _count(self, db):
        db.expire_all()
        return db.query(Material).count()

    def test_legacy_create_without_advisory(self, client: TestClient, auth_headers: dict):
        assert self._create(client, auth_headers).status_code == 200

    def test_reuse_links_advisory(self, client: TestClient, auth_headers: dict, db):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 석고보드", condition="상")
        assert adv["selectedRoute"] == "REUSE"
        r = self._create(client, auth_headers, advisoryId=adv["advisoryId"])
        assert r.status_code == 200
        db.expire_all()
        assert db.get(DisposalAdvisory, adv["advisoryId"]).material_id == r.json()["data"]["id"]

        # 한 판정은 한 매물에만
        assert self._create(client, auth_headers, advisoryId=adv["advisoryId"]).status_code == 422
        # 매물에 연결된 판정은 재지정 불가
        r = client.patch(
            f"{API}/ai/disposal-advisories/{adv['advisoryId']}", json={"selectedRoute": "SCRAP"}, headers=auth_headers
        )
        assert r.status_code == 422

    def test_other_users_advisory_forbidden(self, client: TestClient, auth_headers: dict, auth_headers2: dict, db):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 석고보드", condition="상")
        before = self._count(db)
        assert self._create(client, auth_headers2, advisoryId=adv["advisoryId"]).status_code == 403
        assert self._count(db) == before

    def test_missing_advisory_rejected(self, client: TestClient, auth_headers: dict):
        assert self._create(client, auth_headers, advisoryId=999999).status_code == 422

    def test_recycle_blocked_before_create(self, client: TestClient, auth_headers: dict, db):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 알루미늄 창호", condition="하")
        before = self._count(db)
        assert self._create(client, auth_headers, advisoryId=adv["advisoryId"]).status_code == 422
        assert self._count(db) == before

    def test_mixed_waste_blocked_even_with_override_fields(self, client: TestClient, auth_headers: dict, db):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 건설폐기물")
        before = self._count(db)
        r = self._create(
            client, auth_headers, advisoryId=adv["advisoryId"], selectedRoute="REUSE", overrideReason="본품 양호"
        )
        assert r.status_code == 422
        assert self._count(db) == before

    def test_scrap_override_at_create_needs_reason(self, client: TestClient, auth_headers: dict, db):
        adv = _evaluate(client, auth_headers, title=f"{_token()} 고철용 강관")
        assert adv["recommendedRoute"] == "SCRAP"
        assert self._create(
            client, auth_headers, advisoryId=adv["advisoryId"], selectedRoute="REUSE"
        ).status_code == 422
        r = self._create(
            client, auth_headers, advisoryId=adv["advisoryId"], selectedRoute="REUSE",
            overrideReason="수리·부품용 직거래 수요 있음",
        )
        assert r.status_code == 200
        db.expire_all()
        saved = db.get(DisposalAdvisory, adv["advisoryId"])
        assert (saved.selected_route, saved.override_reason) == ("REUSE", "수리·부품용 직거래 수요 있음")
        assert saved.material_id == r.json()["data"]["id"]
