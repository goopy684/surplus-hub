"""
Tests for /api/v1/ai/triage (거래 전 AI 유동성 진단 & 3-Way 처분 라우팅).

테스트 DB는 세션 전체가 공유하므로 테스트마다 지어낸 고유 용어와 서로 수백 km 떨어진 좌표를 쓴다.
Vision은 기본 비활성(autouse)이고, 필요한 테스트에서만 패치로 켠다.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.ai.services import triage as triage_service
from app.core.config import settings
from app.models.material import Material
from app.models.notification import Notification
from app.models.search_log import SearchLog
from app.models.triage import AiTriageDiagnosis
from app.schemas.ai_schemas import ImageAnalysisResponse

URL = "/api/v1/ai/triage"
# Vision은 우리 업로드 스토리지 URL만 내려받는다 (로컬 스토리지 형식)
UPLOADED = f"{settings.BASE_URL}/static/uploads/triage"


def _loc(i: int) -> tuple[float, float]:
    """테스트별 고립 좌표 — 위도 1도(≈111km)씩 떨어져 반경 10km가 겹치지 않는다."""
    return 20.0 + i, 150.0


@pytest.fixture(autouse=True)
def _triage_defaults(monkeypatch):
    monkeypatch.setattr(triage_service, "_vision_available", lambda: False)
    monkeypatch.setattr(triage_service, "DAILY_LIMIT", 10**6)


def _post(client, headers, **body):
    return client.post(URL, json=body, headers=headers)


def _seed_logs(db, query: str, n: int, lat=None, lng=None):
    db.add_all([SearchLog(query=query, results_count=0, location_lat=lat, location_lng=lng) for _ in range(n)])
    db.commit()


def _seed_materials(db, seller_id: int, title: str, n: int, lat, lng, status="SOLD", price=100_000):
    db.add_all([
        Material(
            title=f"{title} {i}", description=title, price=price, location_address="테스트",
            location_lat=lat, location_lng=lng, status=status, seller_id=seller_id,
        )
        for i in range(n)
    ])
    db.commit()


class TestValidation:
    def test_requires_auth(self, client: TestClient):
        assert client.post(URL, json={"specText": "구리"}).status_code == 401

    @pytest.mark.parametrize("body", [
        {},
        {"specText": "   "},
        {"imageUrls": ["data:image/png;base64,AAAA"]},
        {"imageUrls": [f"https://example.com/{i}.jpg" for i in range(4)]},
        {"specText": "구리", "conditionGrade": "최상"},
        {"specText": "구리", "lat": 91, "lng": 0},
        {"materialKey": "unobtainium"},
    ])
    def test_invalid_input_422(self, client: TestClient, auth_headers, body):
        assert client.post(URL, json=body, headers=auth_headers).status_code == 422


class TestPaths:
    def test_path_a_sus304_clear_spec(self, client: TestClient, auth_headers):
        lat, lng = _loc(1)
        r = _post(
            client, auth_headers, specText="304 스텐 파이프 50A 두 본, 미사용", labelText="KS D 3576",
            materialKey="sus304", conditionGrade="상", quantity=2, quantityUnit="개", weightKg=50,
            lat=lat, lng=lng, locationAddress="경기도 시흥시",
        )
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert d["dispositionPath"] == "A" and d["liquidityScore"] >= 70
        assert d["pathLabel"] == "원형 재사용 직거래"
        assert d["materialLabel"] == "스테인리스 SUS304"
        assert d["breakdown"]["spec"] == 1.0 and d["breakdown"]["condition"] == 1.0
        assert d["expectedDays"] == round(3 + (100 - d["liquidityScore"]) * 0.3)
        assert d["comparison"] == {
            "mixedWaste": -112500, "scrap": 70000, "directSale": 210000, "netBenefit": 322500,
            "priceBasis": "category_default", "similarPriceCount": 0,
        }
        assert d["status"] == "DIAGNOSED" and d["initialScore"] == d["liquidityScore"] and d["scoreDelta"] == 0
        assert d["shareUrl"].endswith(f"/triage/report/{d['shareToken']}")
        assert d["analysisMode"] == "rule_based" and d["weightEstimated"] is False

    def test_path_b_copper_poor_no_spec(self, client: TestClient, auth_headers):
        lat, lng = _loc(2)
        d = _post(client, auth_headers, materialKey="copper", conditionGrade="하", lat=lat, lng=lng).json()["data"]
        assert d["dispositionPath"] == "B" and 30 <= d["liquidityScore"] < 70
        assert d["expectedDays"] == 2 and d["weightEstimated"] is True and d["weightKg"] == 100
        c = d["comparison"]
        assert c["mixedWaste"] == -125000 and c["scrap"] == 900000
        assert c["directSale"] == 1170000  # 고철값 × 하 배수 1.3
        assert c["netBenefit"] == c["directSale"] + abs(c["mixedWaste"])

    def test_path_c_unknown_rusty(self, client: TestClient, auth_headers):
        lat, lng = _loc(3)
        d = _post(
            client, auth_headers, specText="녹슨 잡철 덩어리", conditionGrade="하",
            quantity=1, quantityUnit="톤", lat=lat, lng=lng,
        ).json()["data"]
        assert d["materialKey"] is None and d["materialLabel"] == "소재 미상"
        assert d["dispositionPath"] == "C" and d["liquidityScore"] < 30 and d["expectedDays"] == 1
        c = d["comparison"]
        assert (c["mixedWaste"], c["scrap"], c["directSale"]) == (-350000, 20000, 60000)
        assert c["netBenefit"] == c["directSale"] + abs(c["mixedWaste"])

    def test_one_ton_example(self, client: TestClient, auth_headers):
        lat, lng = _loc(3)
        c = _post(
            client, auth_headers, specText="녹슨 잡철 덩어리", conditionGrade="상", weightKg=1000, lat=lat, lng=lng,
        ).json()["data"]["comparison"]
        assert (c["mixedWaste"], c["scrap"], c["directSale"], c["netBenefit"]) == (-350000, 20000, 150000, 500000)


class TestColdStart:
    def test_cold_then_local_evidence(self, client: TestClient, auth_headers, db, test_user):
        lat, lng = _loc(4)
        body = dict(specText="퀘이사볼트 M12 규격품", conditionGrade="상", lat=lat, lng=lng)
        cold = _post(client, auth_headers, **body).json()["data"]
        assert cold["coldStart"] is True and cold["liquidityScore"] >= 30
        assert cold["breakdown"]["searchCount"] == 0

        _seed_logs(db, "퀘이사볼트 구해요", 10, lat + 0.01, lng)
        _seed_materials(db, test_user.id, "퀘이사볼트 M12", 4, lat, lng + 0.01)
        warm = _post(client, auth_headers, **body).json()["data"]
        assert warm["coldStart"] is False
        assert warm["breakdown"]["searchCount"] == 10 and warm["breakdown"]["similarSoldCount"] == 4
        assert warm["breakdown"]["demand"] > cold["breakdown"]["demand"]
        assert warm["liquidityScore"] > cold["liquidityScore"]
        assert warm["comparison"]["priceBasis"] == "similar_listings"
        assert warm["comparison"]["directSale"] == 100_000

    def test_far_logs_do_not_count(self, client: TestClient, auth_headers, db):
        lat, lng = _loc(5)
        body = dict(specText="네뷸라너트 규격품", conditionGrade="상", lat=lat, lng=lng)
        cold = _post(client, auth_headers, **body).json()["data"]
        _seed_logs(db, "네뷸라너트", 10, lat + 0.5, lng)  # ≈55km
        far = _post(client, auth_headers, **body).json()["data"]
        assert far["breakdown"]["searchCount"] == 0 and far["liquidityScore"] == cold["liquidityScore"]
        _seed_logs(db, "네뷸라너트", 10, lat, lng)
        near = _post(client, auth_headers, **body).json()["data"]
        assert near["breakdown"]["searchCount"] == 10 and near["liquidityScore"] > cold["liquidityScore"]


class TestVision:
    def _vision_result(self):
        return ImageAnalysisResponse(
            category="설비", tags=["밸브"], titleSuggestion="황동 밸브 묶음", condition="하",
            materialType="황동", confidence=0.9,
        )

    def test_vision_failure_falls_back(self, client: TestClient, auth_headers):
        with patch.object(triage_service, "_vision_available", return_value=True), \
             patch.object(triage_service, "analyze_material_image", side_effect=RuntimeError("down")):
            r = _post(client, auth_headers, imageUrls=[f"{UPLOADED}/fail.jpg"], specText="밸브")
        assert r.status_code == 200 and r.json()["data"]["analysisMode"] == "rule_based"

    def test_vision_result_cached_and_worse_grade(self, client: TestClient, auth_headers):
        body = dict(imageUrls=[f"{UPLOADED}/vision-1.jpg"], specText="밸브 묶음", conditionGrade="상")
        with patch.object(triage_service, "_vision_available", return_value=True), \
             patch.object(triage_service, "analyze_material_image", return_value=self._vision_result()) as mock:
            first = _post(client, auth_headers, **body).json()["data"]
            second = _post(client, auth_headers, **body).json()["data"]
        assert first["analysisMode"] == "vision" and second["analysisMode"] == "vision_cached"
        mock.assert_called_once()
        assert first["materialKey"] == "brass" and first["title"] == "황동 밸브 묶음"
        assert first["category"] == "설비"
        assert first["conditionGrade"] == "하"  # 사용자 '상' vs Vision '하' → 낮은 쪽

    def test_vision_cache_depends_on_keyword(self, client: TestClient, auth_headers):
        """같은 사진이라도 규격 텍스트를 고치면 이전 분석 결과를 재사용하지 않는다."""
        with patch.object(triage_service, "_vision_available", return_value=True), \
             patch.object(triage_service, "analyze_material_image", return_value=self._vision_result()) as mock:
            for text in ("구리 50A", "목재 판넬"):
                _post(client, auth_headers, imageUrls=[f"{UPLOADED}/keyword.jpg"], specText=text)
        assert mock.call_count == 2

    @pytest.mark.parametrize("url", [
        "http://127.0.0.1:8000/health",
        "http://169.254.169.254/latest/meta-data/",
        "https://example.com/not-ours.jpg",
    ])
    def test_vision_never_fetches_foreign_urls(self, client: TestClient, auth_headers, url):
        """서버가 임의 URL을 내려받지 않는다 (SSRF). 진단 자체는 규칙 기반으로 계속된다."""
        with patch.object(triage_service, "_vision_available", return_value=True), \
             patch.object(triage_service, "analyze_material_image") as mock:
            r = _post(client, auth_headers, imageUrls=[url], specText="밸브")
        mock.assert_not_called()
        assert r.status_code == 200 and r.json()["data"]["analysisMode"] == "rule_based"

    def test_vision_skipped_when_both_chips(self, client: TestClient, auth_headers):
        with patch.object(triage_service, "_vision_available", return_value=True), \
             patch.object(triage_service, "analyze_material_image") as mock:
            d = _post(
                client, auth_headers, imageUrls=[f"{UPLOADED}/chips.jpg"],
                materialKey="brass", conditionGrade="중",
            ).json()["data"]
        mock.assert_not_called()
        assert d["analysisMode"] == "rule_based" and d["conditionGrade"] == "중"


class TestVaultAndConvert:
    def test_vault_rescore_ownership_and_convert(
        self, client: TestClient, auth_headers, auth_headers2, db, test_user,
    ):
        lat, lng = _loc(6)
        d = _post(client, auth_headers, specText="오로라앵커 50A", conditionGrade="상", lat=lat, lng=lng).json()["data"]
        did = d["id"]

        for method, path in (("get", f"/{did}"), ("post", f"/{did}/save-vault"), ("post", f"/{did}/convert")):
            assert getattr(client, method)(f"{URL}{path}", headers=auth_headers2).status_code == 404

        r = client.post(f"{URL}/{did}/save-vault", headers=auth_headers)
        assert r.status_code == 200 and r.json()["data"]["status"] == "VAULT_SAVED"
        assert client.post(f"{URL}/{did}/save-vault", headers=auth_headers).status_code == 200  # 멱등

        _seed_logs(db, "오로라앵커 구매", 10, lat, lng)
        _seed_materials(db, test_user.id, "오로라앵커", 3, lat, lng)
        vault = client.get(f"{URL}/vault", headers=auth_headers).json()
        item = next(i for i in vault["data"] if i["id"] == did)
        assert vault["meta"]["totalCount"] == len(vault["data"])
        assert item["liquidityScore"] > item["initialScore"] and item["scoreDelta"] > 0
        assert all(i["id"] != did for i in client.get(f"{URL}/vault", headers=auth_headers2).json()["data"])

        r = client.post(f"{URL}/{did}/convert", headers=auth_headers)
        assert r.status_code == 200, r.text
        material_id = r.json()["data"]["materialId"]
        assert r.json()["data"]["diagnosis"]["status"] == "LISTED_MATERIAL"
        assert r.json()["data"]["diagnosis"]["materialId"] == material_id
        m = client.get(f"/api/v1/materials/{material_id}").json()["data"]
        assert m["liquidityScore"] == item["liquidityScore"]
        assert m["dispositionPath"] == item["dispositionPath"]
        assert m["location"]["address"] == "위치 미정"
        assert "오로라앵커" in m["description"]

        again = client.post(f"{URL}/{did}/convert", headers=auth_headers)
        assert again.status_code == 409 and again.json()["detail"]["materialId"] == material_id
        assert client.post(f"{URL}/{did}/save-vault", headers=auth_headers).status_code == 409
        assert did not in [i["id"] for i in client.get(f"{URL}/vault", headers=auth_headers).json()["data"]]
        listed = client.get(f"{URL}/vault?includeListed=true", headers=auth_headers).json()["data"]
        assert did in [i["id"] for i in listed]

    def test_convert_path_override(self, client: TestClient, auth_headers):
        lat, lng = _loc(7)
        d = _post(client, auth_headers, specText="녹슨 잡철 오버라이드", conditionGrade="하", lat=lat, lng=lng).json()["data"]
        assert d["dispositionPath"] == "C"
        r = client.post(
            f"{URL}/{d['id']}/convert", json={"path": "A", "price": 12345, "title": "재지정 매물"},
            headers=auth_headers,
        ).json()["data"]
        m = client.get(f"/api/v1/materials/{r['materialId']}").json()["data"]
        assert m["dispositionPath"] == "A" and m["price"] == 12345 and m["title"] == "재지정 매물"
        assert r["diagnosis"]["dispositionPath"] == "C"  # 진단 행은 AI 판정 그대로

    def test_override_without_price_uses_overridden_path_default(self, client: TestClient, auth_headers):
        lat, lng = _loc(13)
        d = _post(client, auth_headers, specText="녹슨 잡철 기본가", conditionGrade="하", lat=lat, lng=lng).json()["data"]
        assert d["dispositionPath"] == "C" and d["comparison"]["directSale"] != d["comparison"]["scrap"]
        r = client.post(f"{URL}/{d['id']}/convert", json={"path": "A"}, headers=auth_headers).json()["data"]
        m = client.get(f"/api/v1/materials/{r['materialId']}").json()["data"]
        assert m["price"] == d["comparison"]["directSale"]  # 재지정한 경로(A)의 기본가


    def test_convert_is_atomic_and_copies_images(self, client: TestClient, auth_headers, db):
        """커밋이 실패하면 진단도 매물도 남지 않는다. 다시 시도하면 정상 등록되고 사진이 따라간다."""
        img = f"{UPLOADED}/convert.jpg"
        d = _post(client, auth_headers, imageUrls=[img], materialKey="copper", conditionGrade="하").json()["data"]
        before = db.query(Material).count()
        with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("db down")):
            with pytest.raises(RuntimeError):
                client.post(f"{URL}/{d['id']}/convert", headers=auth_headers)
        db.expire_all()
        assert db.query(Material).count() == before
        assert db.get(AiTriageDiagnosis, d["id"]).status == "DIAGNOSED"

        r = client.post(f"{URL}/{d['id']}/convert", headers=auth_headers).json()["data"]
        m = client.get(f"/api/v1/materials/{r['materialId']}").json()["data"]
        assert m["images"] == [img] and m["dispositionPath"] == "B"


    def test_own_listing_does_not_lower_score(self, client: TestClient, auth_headers):
        """전환된 매물 자신을 유사 매물(미체결 공급)로 세지 않는다."""
        lat, lng = _loc(15)
        d = _post(client, auth_headers, materialKey="copper", conditionGrade="하", lat=lat, lng=lng).json()["data"]
        client.post(f"{URL}/{d['id']}/convert", headers=auth_headers)
        listed = client.get(f"{URL}/vault?includeListed=true", headers=auth_headers).json()["data"]
        item = next(i for i in listed if i["id"] == d["id"])
        assert item["scoreDelta"] == 0 and item["breakdown"]["similarActiveCount"] == 0


class TestTwoAxes:
    """품목(업종 카테고리) = 재사용 수요 기본값, 소재 = 고철 단가. 두 축은 서로 간섭하지 않는다."""

    @pytest.mark.parametrize("spec,category", [
        ("LED 평판등 640x640 미개봉 20개", "조명"),
        ("KS 볼밸브 50A 10개 미사용", "설비"),
        ("600각 포세린 타일 5박스 미개봉", "건축자재"),
    ])
    def test_standard_finished_goods_reach_path_a(self, client: TestClient, auth_headers, spec, category):
        """IR 5대 집중 품목은 소재 목록에 없어도 상태·규격이 좋으면 직거래(A)로 간다."""
        lat, lng = _loc(16)
        d = _post(client, auth_headers, specText=spec, conditionGrade="상", lat=lat, lng=lng).json()["data"]
        assert d["category"] == category
        assert d["dispositionPath"] == "A" and d["liquidityScore"] >= 70, d["breakdown"]
        assert d["quantity"] in (20, 10, 5)  # 메모의 수량을 읽는다

    def test_category_chip_wins_and_sets_demand_prior(self, client: TestClient, auth_headers):
        lat, lng = _loc(17)
        body = dict(specText="규격품 50A", conditionGrade="상", lat=lat, lng=lng)
        other = _post(client, auth_headers, **body).json()["data"]
        plumbing = _post(client, auth_headers, category="설비", **body).json()["data"]
        assert other["category"] == "기타" and plumbing["category"] == "설비"
        assert plumbing["breakdown"]["demand"] > other["breakdown"]["demand"]
        assert plumbing["liquidityScore"] > other["liquidityScore"]
        assert plumbing["comparison"]["scrap"] == other["comparison"]["scrap"]  # 품목은 고철값을 바꾸지 않는다

    def test_material_changes_scrap_not_demand(self, client: TestClient, auth_headers):
        lat, lng = _loc(17)
        body = dict(category="설비", conditionGrade="상", weightKg=100, lat=lat, lng=lng)
        sus = _post(client, auth_headers, materialKey="sus304", **body).json()["data"]
        cu = _post(client, auth_headers, materialKey="copper", **body).json()["data"]
        assert sus["breakdown"]["demand"] == cu["breakdown"]["demand"]
        assert (sus["comparison"]["scrap"], cu["comparison"]["scrap"]) == (140_000, 900_000)

    def test_length_in_memo_is_not_quantity(self, client: TestClient, auth_headers):
        d = _post(client, auth_headers, specText="STS304 배관 50A 6m 15본", category="설비").json()["data"]
        assert d["quantity"] is None and d["quantityUnit"] is None

    def test_unknown_category_rejected_and_category_alone_is_enough(self, client: TestClient, auth_headers):
        assert _post(client, auth_headers, category="가전", specText="x").status_code == 422
        assert _post(client, auth_headers, category="조명").status_code == 200

    @pytest.mark.parametrize("text,category", [
        ("아연도금 클램프", "건축자재"),  # "램프"로 조명에 걸리던 경우
        ("주문 취소분 문의", "기타"),      # "문" 한 글자로 문/창호에 걸리면 안 된다
        ("방화문 2짝", "문/창호"),
        ("CV 케이블 잔여 롤", "전기"),
    ])
    def test_category_inference(self, text, category):
        assert triage_service.infer_category(text) == category

    @pytest.mark.parametrize("text,key", [
        ("인코넬 봉재", "nickel"), ("초경 팁 스크랩", "carbide"), ("티타늄 판", "titanium"),
        ("430 스텐 판재", "sus430"), ("리튬 배터리 팩", "battery_li"), ("납축 배터리", "battery"),
        ("주철 맨홀", "cast_iron"), ("아연도금 클램프", "steel"), ("나동선", "copper"),
    ])
    def test_extended_material_detection(self, text, key):
        assert triage_service.detect_material(text) == key

    def test_high_value_material_amounts_are_clamped(self, client: TestClient, auth_headers):
        d = _post(client, auth_headers, materialKey="carbide", conditionGrade="상", weightKg=50_000).json()["data"]
        c = d["comparison"]
        assert c["scrap"] <= triage_service.MAX_AMOUNT and c["directSale"] <= triage_service.MAX_AMOUNT
        assert c["netBenefit"] < 2**31


class TestDemandCoverage:
    def test_plain_keyword_search_counts_as_demand(self, client: TestClient, auth_headers, db):
        """홈·검색 화면의 일반 키워드 검색(/materials?keyword=)도 수요로 기록된다."""
        lat, lng = _loc(18)
        before = db.query(SearchLog).filter(SearchLog.query == "네뷸라커플러").count()
        for i in range(3):  # 서로 다른 검색자 3명
            r = client.get(
                f"/api/v1/materials/?keyword=네뷸라커플러&lat={lat}&lng={lng}",
                headers={"X-Forwarded-For": f"10.0.0.{i + 1}"},
            )
            assert r.status_code == 200
        client.get(f"/api/v1/materials/?keyword=네뷸라커플러&page=2&lat={lat}&lng={lng}")  # 더 보기는 같은 검색
        client.get("/api/v1/materials/?category=설비")  # 키워드 없는 탐색은 검색이 아니다
        logs = db.query(SearchLog).filter(SearchLog.query == "네뷸라커플러").all()
        assert len(logs) - before == 3 and logs[-1].location_lat == lat

        d = _post(client, auth_headers, specText="네뷸라커플러 50A", lat=lat, lng=lng).json()["data"]
        assert d["breakdown"]["searchCount"] == 3 and d["coldStart"] is False

    def test_repeat_search_by_same_searcher_counts_once(
        self, client: TestClient, auth_headers, auth_headers2, db,
    ):
        """새로고침·창 포커스 재요청·반복 입력은 수요가 아니다: 검색자×검색어당 24시간 1건, 재산정도 1회."""
        q = "/api/v1/materials/?keyword=펄서{}%20앵글"
        count = lambda: db.query(SearchLog).filter(SearchLog.query.like("펄서%")).count()  # noqa: E731
        with patch.object(triage_service, "rescore_vault_for_search_background") as bg:
            for _ in range(3):
                client.get(q.format(""), headers=auth_headers)  # 같은 계정
            client.get(q.format("  "), headers=auth_headers)  # 공백만 다른 검색어도 같은 검색
            assert count() == 1 and bg.call_count == 1
            client.get(q.format(""), headers=auth_headers2)  # 다른 계정은 같은 IP여도 따로 센다
            client.get(q.format(""))  # 비로그인은 IP로 구분
            client.get(q.format(""))
            assert count() == 3 and bg.call_count == 3
            client.get(q.format(""), headers={"Authorization": "Bearer not-a-jwt"})  # 깨진 토큰 = 비로그인(IP)
            assert count() == 3

    def test_notifies_when_crossing_path_a_even_under_ten_points(self, client: TestClient, auth_headers, db):
        """10점 미만 상승이어도 70점(A)을 새로 넘으면 알린다."""
        lat, lng = _loc(19)
        d = _post(
            client, auth_headers, specText="퀘이사조인트 50A", category="건축자재", conditionGrade="상",
            lat=lat, lng=lng,
        ).json()["data"]
        assert 60 <= d["liquidityScore"] < 70 and d["dispositionPath"] == "B", d
        client.post(f"{URL}/{d['id']}/save-vault", headers=auth_headers)
        _seed_logs(db, "퀘이사조인트 구합니다", 6, lat, lng)
        with patch("app.core.notify.send_push_notification", return_value={"skipped": True}):
            assert triage_service.rescore_vault_for_search(db, "퀘이사조인트", lat, lng) == 1
        db.expire_all()
        diag = db.get(AiTriageDiagnosis, d["id"])
        assert 70 <= diag.liquidity_score < d["liquidityScore"] + 10 and diag.disposition_path == "A"

    def test_vault_needs_something_to_match_demand_against(self, client: TestClient, auth_headers):
        """사진만 있거나 품목 칩만 고른 진단은 검색어와 맞춰 볼 단어가 없다 — 알림을 약속하지 않는다."""
        for body in (dict(imageUrls=[f"{UPLOADED}/photo-only.jpg"]), dict(category="조명")):
            d = _post(client, auth_headers, **body).json()["data"]
            r = client.post(f"{URL}/{d['id']}/save-vault", headers=auth_headers)
            assert r.status_code == 422 and r.json()["detail"]["code"] == "NO_DEMAND_TERMS"
        ok = _post(client, auth_headers, category="조명", specText="LED 평판등").json()["data"]
        assert client.post(f"{URL}/{ok['id']}/save-vault", headers=auth_headers).status_code == 200


class TestBounds:
    def test_weight_is_capped_so_amounts_fit_integer_columns(self, client: TestClient, auth_headers):
        assert _post(client, auth_headers, materialKey="copper", weightKg=1_000_000).status_code == 422
        d = _post(
            client, auth_headers, materialKey="copper", conditionGrade="상", quantity=1_000_000, quantityUnit="톤",
        ).json()["data"]
        assert d["weightKg"] == triage_service.MAX_WEIGHT_KG
        assert max(d["comparison"]["directSale"], d["comparison"]["netBenefit"]) < 2**31

    def test_demand_matching_respects_word_boundaries(self, client: TestClient, auth_headers, db):
        """'sus' 별칭이 'suspension' 검색을 SUS304 수요로 세지 않는다."""
        lat, lng = _loc(14)
        _seed_logs(db, "suspension bracket", 10, lat, lng)
        d = _post(client, auth_headers, materialKey="sus304", conditionGrade="상", lat=lat, lng=lng).json()["data"]
        assert d["breakdown"]["searchCount"] == 0 and d["coldStart"] is True
        _seed_logs(db, "SUS 배관 구합니다", 4, lat, lng)
        d2 = _post(client, auth_headers, materialKey="sus304", conditionGrade="상", lat=lat, lng=lng).json()["data"]
        assert d2["breakdown"]["searchCount"] == 4

    @pytest.mark.parametrize("text,key", [
        ("316 스텐 배관 25A", "sus316"), ("스텐 316L 파이프", "sus316"),
        ("304 스텐 파이프 50A", "sus304"), ("스텐 배관", "sus304"),
    ])
    def test_stainless_grade_detection(self, text, key):
        """'스텐'이 sus304 별칭이라 316 표기가 304로 잡히던 문제."""
        assert triage_service.detect_material(text) == key

    def test_label_text_is_kept(self, client: TestClient, auth_headers):
        d = _post(client, auth_headers, specText="50A", labelText="KS D 3576").json()["data"]
        assert d["specText"] == "50A KS D 3576"


class TestFeedPurity:
    def test_b_excluded_from_feed_and_search(self, client: TestClient, auth_headers, db):
        lat, lng = _loc(8)
        b = _post(client, auth_headers, materialKey="copper", conditionGrade="하", lat=lat, lng=lng).json()["data"]
        a = _post(
            client, auth_headers, specText="304 스텐 파이프 50A", labelText="KS", materialKey="sus304",
            conditionGrade="상", lat=lat, lng=lng,
        ).json()["data"]
        assert (b["dispositionPath"], a["dispositionPath"]) == ("B", "A")
        b_id = client.post(f"{URL}/{b['id']}/convert", json={"title": "피드순도비 구리"}, headers=auth_headers).json()["data"]["materialId"]
        a_id = client.post(f"{URL}/{a['id']}/convert", json={"title": "피드순도에이 스텐"}, headers=auth_headers).json()["data"]["materialId"]

        def ids(qs):
            return [m["id"] for m in client.get(f"/api/v1/materials/?{qs}").json()["data"]]

        assert b_id not in ids("keyword=피드순도비")
        assert b_id in ids("keyword=피드순도비&track=B")
        assert b_id not in ids("keyword=피드순도비&track=C")
        assert b_id not in ids("keyword=피드순도비&track=X")  # 모르는 값은 무시 → 기본 피드
        assert a_id in ids("keyword=피드순도에이")
        assert a_id not in ids("keyword=피드순도에이&track=B")

        # 커서 페이지네이션도 동일 (엔드포인트 커서 경로는 response_model 불일치로 별도 이슈 — CRUD로 확인)
        from app.crud.crud_material import crud_material
        assert b_id not in [m.id for m in crud_material.get_multi_cursor(db, keyword="피드순도비")[0]]
        assert b_id in [m.id for m in crud_material.get_multi_cursor(db, keyword="피드순도비", track="B")[0]]

        from app.ai.services.search import keyword_only_search
        assert keyword_only_search(db, "피드순도비")[1] == 0
        assert keyword_only_search(db, "피드순도에이")[1] == 1


class TestDemandNotification:
    def test_rise_notifies_once(self, client: TestClient, auth_headers, db, test_user):
        lat, lng = _loc(9)
        d = _post(client, auth_headers, specText="플라즈마클램프 50A", conditionGrade="상", lat=lat, lng=lng).json()["data"]
        client.post(f"{URL}/{d['id']}/save-vault", headers=auth_headers)
        _seed_logs(db, "플라즈마클램프", 10, lat, lng)
        _seed_materials(db, test_user.id, "플라즈마클램프", 4, lat, lng)

        def notifications():
            return db.query(Notification).filter(
                Notification.type == "TRIAGE_DEMAND", Notification.reference_id == d["id"],
            ).all()

        with patch("app.core.notify.send_push_notification") as push:
            push.return_value = {"success": 1}
            # 반경 밖 검색은 재산정·알림 대상이 아니다
            assert triage_service.rescore_vault_for_search(db, "플라즈마클램프", lat + 1, lng) == 0
            assert triage_service.rescore_vault_for_search(db, "플라즈마클램프 구합니다", lat, lng) == 1
            assert triage_service.rescore_vault_for_search(db, "플라즈마클램프 구합니다", lat, lng) == 0
        rows = notifications()
        assert len(rows) == 1 and rows[0].reference_type == "triage" and rows[0].user_id == test_user.id
        assert f"{d['liquidityScore']}점 →" in rows[0].body

        db.expire_all()
        diag = db.get(AiTriageDiagnosis, d["id"])
        assert diag.notified_at is not None and diag.last_notified_score > d["liquidityScore"]
        assert client.get(f"{URL}/{d['id']}", headers=auth_headers).status_code == 200
        db.expire_all()
        assert db.get(AiTriageDiagnosis, d["id"]).reopened_at is not None

    def test_background_uses_given_bind_and_fails_quietly(self, db):
        # 요청 세션의 엔진으로 실행된다 — 맞는 보관함 진단이 없으면 0
        assert triage_service.rescore_vault_for_search_background(db.get_bind(), "아무도안찾는문구", None, None) == 0
        with patch.object(triage_service, "rescore_vault_for_search", side_effect=RuntimeError("boom")):
            assert triage_service.rescore_vault_for_search_background(db.get_bind(), "아무거나") == 0

    def test_search_enqueues_rescore(self, client: TestClient):
        with patch("app.ai.services.search.hybrid_search", return_value=([], 0, "keyword_only")), \
             patch.object(triage_service, "rescore_vault_for_search_background") as bg:
            r = client.get("/api/v1/ai/search?q=트리아지검색&locationLat=37.1&locationLng=127.1")
        assert r.status_code == 200
        assert bg.call_args.args[1:] == ("트리아지검색", 37.1, 127.1)
        assert bg.call_args.args[0].dialect.name == "sqlite"  # 요청과 같은 엔진 (SessionLocal 아님)


class TestHotDemands:
    def test_no_logs_no_items(self, client: TestClient):
        with patch.object(triage_service, "_fetch_logs", return_value=[]), \
             patch.object(triage_service, "_open_wanted", return_value=[]):  # 수요 근거 둘 다 없음
            r = client.get(f"{URL}/hot-demands")
        assert r.status_code == 200
        assert r.json()["data"]["items"] == [] and r.json()["data"]["scope"] == "all"

    def test_ranked_items_and_min_score(self, client: TestClient, auth_headers, db):
        lat, lng = _loc(10)
        _seed_logs(db, "코스모스 브라켓", 8, lat, lng)
        _seed_logs(db, "갤럭시 행거", 4, lat + 0.01, lng)
        _seed_logs(db, "코스모스 브라켓", 5, lat + 1, lng)  # 반경 밖
        _seed_logs(db, "한두번 검색한 문구", 2, lat, lng)  # 자유 검색어는 3회 미만이면 노출하지 않는다
        d = _post(client, auth_headers, specText="전광판 절감 확인용", weightKg=200, lat=lat, lng=lng).json()["data"]
        client.post(f"{URL}/{d['id']}/convert", headers=auth_headers)

        data = client.get(f"{URL}/hot-demands?lat={lat}&lng={lng}&radiusKm=10").json()["data"]
        assert data["scope"] == "nearby" and data["radiusKm"] == 10
        by_key = {i["key"]: i for i in data["items"]}
        cosmos, galaxy = by_key["코스모스 브라켓"], by_key["갤럭시 행거"]
        assert cosmos["searchCount"] == 8 and galaxy["searchCount"] == 4
        assert cosmos["label"] == "코스모스 브라켓" and "sampleQuery" not in cosmos
        assert "한두번 검색한 문구" not in by_key
        assert data["items"].index(cosmos) < data["items"].index(galaxy)
        assert data["weeklyListedCount"] == 1
        assert data["weeklyDisposalSaved"] == abs(d["comparison"]["mixedWaste"])

        threshold = galaxy["liquidityScore"] + 1
        assert cosmos["liquidityScore"] >= threshold
        keys = [i["key"] for i in client.get(
            f"{URL}/hot-demands?lat={lat}&lng={lng}&minScore={threshold}"
        ).json()["data"]["items"]]
        assert "코스모스 브라켓" in keys and "갤럭시 행거" not in keys


class TestDemandDensity:
    def test_searches_never_lower_demand(self):
        """prior가 높은 소재도 검색이 쌓이면 수요가 오른다 (보관함 알림의 전제)."""
        for prior in (0.30, 0.65, 0.70):
            values = [triage_service._demand_density(prior, n, 0, 0)[0] for n in (0, 1, 5, 10, 50)]
            assert values == sorted(values) and values[0] == prior and values[3] > prior

    def test_listings_shrink_prior_both_ways(self):
        sold_out, _ = triage_service._demand_density(0.5, 0, 10, 0)
        unsold, _ = triage_service._demand_density(0.5, 0, 0, 10)
        assert unsold < 0.5 < sold_out
        assert triage_service._demand_density(0.5, 0, 0, 0)[1] is True  # 근거 없음 = cold start
        assert triage_service._demand_density(0.5, 2, 1, 0)[1] is False


class TestSharedReport:
    def test_public_without_location_details(self, client: TestClient, auth_headers):
        lat, lng = _loc(11)
        d = _post(
            client, auth_headers, specText="공유리포트 자재", lat=lat, lng=lng,
            locationAddress="경기도 시흥시 정왕동 123-4",
        ).json()["data"]
        r = client.get(f"{URL}/shared/{d['shareToken']}")
        assert r.status_code == 200
        shared = r.json()["data"]
        assert shared["location"] == {"address": None}  # 주소·좌표 모두 비공개
        assert "시흥" not in r.text and str(lat) not in r.text
        assert "id" not in shared and shared["shareToken"] == d["shareToken"]
        assert shared["liquidityScore"] == d["liquidityScore"]
        assert client.get(f"{URL}/shared/no-such-token").status_code == 404


class TestFunnel:
    def test_permissions_and_numbers(self, client: TestClient, auth_headers, moderator_headers):
        assert client.get(f"{URL}/funnel").status_code == 401
        assert client.get(f"{URL}/funnel", headers=auth_headers).status_code == 403
        _post(client, auth_headers, specText="퍼널 확인용")
        r = client.get(f"{URL}/funnel?days=30", headers=moderator_headers)
        assert r.status_code == 200
        f = r.json()["data"]
        assert f["diagnosed"] >= 1 and f["diagnosed"] == sum(f["byPath"].values())
        assert f["listed"] == sum(f["listedByPath"].values())
        for k in ("vaultSaveRate", "listingRate", "pushReopenRate"):
            assert 0 <= f[k] <= 1


class TestDailyLimit:
    def test_daily_cap_429(self, client: TestClient, auth_headers2, db, test_user2, monkeypatch):
        monkeypatch.setattr(triage_service, "DAILY_LIMIT", triage_service.count_recent(db, test_user2.id) + 1)
        assert _post(client, auth_headers2, specText="일일상한 확인").status_code == 200
        assert _post(client, auth_headers2, specText="일일상한 확인").status_code == 429
