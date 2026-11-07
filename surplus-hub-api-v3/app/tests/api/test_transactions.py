"""Tests for transaction endpoints: /api/v1/transactions/*

Full transaction lifecycle: create material -> buyer creates transaction
-> seller confirms -> either party completes.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.crud.crud_transaction import split_price

API_V1_STR = settings.API_V1_STR
TX_PREFIX = f"{API_V1_STR}/transactions"
MAT_PREFIX = f"{API_V1_STR}/materials"

# HTTPBearer returns 401 in newer FastAPI/Starlette versions, 403 in older ones.
_NO_AUTH_CODES = (401, 403)


# ---------------------------------------------------------------------------
# Helper: create a material owned by test_user (seller) via the API
# ---------------------------------------------------------------------------
def _create_material(
    client: TestClient, auth_headers: dict, quantity: int = 1
) -> int:
    """Create a material and return its ID."""
    payload = {
        "title": "TX Test Material",
        "description": "For transaction test",
        "price": 50000,
        "location": {"address": "Busan"},
        "quantity": quantity,
        "quantityUnit": "ea",
        "tradeMethod": "DIRECT",
    }
    resp = client.post(f"{MAT_PREFIX}/", json=payload, headers=auth_headers)
    assert resp.status_code == 200, f"Material creation failed: {resp.text}"
    data = resp.json()
    assert data["status"] == "success"
    return data["data"]["id"]


# ---------------------------------------------------------------------------
# Auth guard tests (no token)
# ---------------------------------------------------------------------------
class TestTransactionAuthGuards:
    """All transaction endpoints must reject unauthenticated requests."""

    def test_create_requires_auth(self, client: TestClient):
        resp = client.post(f"{TX_PREFIX}/", json={"materialId": 1})
        assert resp.status_code in _NO_AUTH_CODES

    def test_list_requires_auth(self, client: TestClient):
        resp = client.get(f"{TX_PREFIX}/")
        assert resp.status_code in _NO_AUTH_CODES

    def test_get_detail_requires_auth(self, client: TestClient):
        resp = client.get(f"{TX_PREFIX}/1")
        assert resp.status_code in _NO_AUTH_CODES

    def test_confirm_requires_auth(self, client: TestClient):
        resp = client.patch(f"{TX_PREFIX}/1/confirm")
        assert resp.status_code in _NO_AUTH_CODES

    def test_complete_requires_auth(self, client: TestClient):
        resp = client.patch(f"{TX_PREFIX}/1/complete")
        assert resp.status_code in _NO_AUTH_CODES


# ---------------------------------------------------------------------------
# Validation & business-rule tests
# ---------------------------------------------------------------------------
class TestCreateTransactionValidation:
    """POST /transactions/ edge cases."""

    def test_material_not_found(self, client: TestClient, auth_headers2):
        """Buying a non-existent material should return 404."""
        resp = client.post(
            f"{TX_PREFIX}/",
            json={"materialId": 99999},
            headers=auth_headers2,
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_cannot_buy_own_material(self, client: TestClient, auth_headers):
        """Seller cannot buy their own material."""
        material_id = _create_material(client, auth_headers)
        resp = client.post(
            f"{TX_PREFIX}/",
            json={"materialId": material_id},
            headers=auth_headers,  # same user who created the material
        )
        assert resp.status_code == 400
        assert "own material" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Full lifecycle test
# ---------------------------------------------------------------------------
class TestTransactionLifecycle:
    """
    End-to-end transaction flow:
    1. user1 (seller) creates a material
    2. user2 (buyer) creates a transaction
    3. user1 (seller) confirms
    4. user2 (buyer) completes
    """

    def test_full_lifecycle(
        self,
        client: TestClient,
        auth_headers,
        auth_headers2,
        test_user,
        test_user2,
    ):
        # -- Step 1: Seller creates a material --
        material_id = _create_material(client, auth_headers)

        # -- Step 2: Buyer creates a transaction --
        create_resp = client.post(
            f"{TX_PREFIX}/",
            json={"materialId": material_id, "note": "I need this urgently"},
            headers=auth_headers2,
        )
        assert create_resp.status_code == 200
        tx_data = create_resp.json()
        assert tx_data["status"] == "success"
        tx = tx_data["data"]
        tx_id = tx["id"]

        assert tx["materialId"] == material_id
        assert tx["buyerId"] == test_user2.id
        assert tx["sellerId"] == test_user.id
        assert tx["status"] == "PENDING"
        assert tx["note"] == "I need this urgently"
        assert tx["price"] == 50000

        # -- Step 3: List transactions (buyer sees it) --
        list_resp = client.get(f"{TX_PREFIX}/", headers=auth_headers2)
        assert list_resp.status_code == 200
        list_data = list_resp.json()
        assert list_data["status"] == "success"
        assert isinstance(list_data["data"], list)
        tx_ids = [t["id"] for t in list_data["data"]]
        assert tx_id in tx_ids

        # -- Step 4: Get transaction detail (buyer) --
        detail_resp = client.get(
            f"{TX_PREFIX}/{tx_id}", headers=auth_headers2
        )
        assert detail_resp.status_code == 200
        assert detail_resp.json()["data"]["id"] == tx_id

        # -- Step 5: Get transaction detail (seller) --
        detail_resp_seller = client.get(
            f"{TX_PREFIX}/{tx_id}", headers=auth_headers
        )
        assert detail_resp_seller.status_code == 200

        # -- Step 6: Buyer cannot confirm (only seller can) --
        buyer_confirm = client.patch(
            f"{TX_PREFIX}/{tx_id}/confirm", headers=auth_headers2
        )
        assert buyer_confirm.status_code == 403
        assert "seller" in buyer_confirm.json()["detail"].lower()

        # -- Step 7: Seller confirms --
        confirm_resp = client.patch(
            f"{TX_PREFIX}/{tx_id}/confirm", headers=auth_headers
        )
        assert confirm_resp.status_code == 200
        assert confirm_resp.json()["data"]["status"] == "CONFIRMED"

        # -- Step 8: Cannot confirm again (not pending) --
        re_confirm = client.patch(
            f"{TX_PREFIX}/{tx_id}/confirm", headers=auth_headers
        )
        assert re_confirm.status_code == 400
        assert "not pending" in re_confirm.json()["detail"].lower()

        # -- Step 9: Complete (buyer) --
        complete_resp = client.patch(
            f"{TX_PREFIX}/{tx_id}/complete", headers=auth_headers2
        )
        assert complete_resp.status_code == 200
        assert complete_resp.json()["data"]["status"] == "COMPLETED"

    def test_complete_before_confirm_fails(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        """Cannot complete a transaction that has not been confirmed yet."""
        material_id = _create_material(client, auth_headers)

        # Buyer creates transaction
        create_resp = client.post(
            f"{TX_PREFIX}/",
            json={"materialId": material_id},
            headers=auth_headers2,
        )
        assert create_resp.status_code == 200
        tx_id = create_resp.json()["data"]["id"]

        # Try to complete without confirming first
        complete_resp = client.patch(
            f"{TX_PREFIX}/{tx_id}/complete", headers=auth_headers2
        )
        assert complete_resp.status_code == 400
        assert "confirmed" in complete_resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------
class TestTransactionAccessControl:
    """Only transaction participants should access the detail."""

    def test_non_participant_cannot_view(
        self,
        client: TestClient,
        auth_headers,
        auth_headers2,
        superuser_headers,
    ):
        """A third user (superuser here) should not see another pair's transaction."""
        material_id = _create_material(client, auth_headers)

        create_resp = client.post(
            f"{TX_PREFIX}/",
            json={"materialId": material_id},
            headers=auth_headers2,
        )
        assert create_resp.status_code == 200
        tx_id = create_resp.json()["data"]["id"]

        # Superuser is not a participant
        detail_resp = client.get(
            f"{TX_PREFIX}/{tx_id}", headers=superuser_headers
        )
        assert detail_resp.status_code == 403

    def test_transaction_not_found(self, client: TestClient, auth_headers):
        resp = client.get(f"{TX_PREFIX}/99999", headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 수량별 분할 거래
# ---------------------------------------------------------------------------
def _get_material(client: TestClient, material_id: int) -> dict:
    resp = client.get(f"{MAT_PREFIX}/{material_id}")
    assert resp.status_code == 200
    return resp.json()["data"]


def _buy(client: TestClient, headers: dict, material_id: int, quantity=None):
    payload = {"materialId": material_id}
    if quantity is not None:
        payload["quantity"] = quantity
    return client.post(f"{TX_PREFIX}/", json=payload, headers=headers)


def _confirm_and_complete(client: TestClient, seller_headers, buyer_headers, tx_id):
    assert client.patch(f"{TX_PREFIX}/{tx_id}/confirm", headers=seller_headers).status_code == 200
    return client.patch(f"{TX_PREFIX}/{tx_id}/complete", headers=buyer_headers)


class TestSplitPrice:
    @pytest.mark.parametrize(
        "price,quantity,available,expected",
        [
            (50000, 3, 10, 15000),
            (100, 2, 3, 67),  # 66.67 -> 67
            (5, 1, 2, 3),  # 2.5 -> 3 (Math.round half-up)
            (1, 1, 10, 1),  # 최소 1원
            (0, 3, 10, 0),  # 무료나눔은 일부 수량도 0원
            (50000, 10, 10, 50000),  # 전체 구매 = 원가
        ],
    )
    def test_split_price(self, price, quantity, available, expected):
        assert split_price(price, quantity, available) == expected


class TestPartialQuantityTransaction:
    def test_partial_purchase_prices_proportionally_and_keeps_active(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        material_id = _create_material(client, auth_headers, quantity=10)

        with patch("app.api.endpoints.transactions.notify") as mock_notify:
            resp = _buy(client, auth_headers2, material_id, quantity=3)
        assert resp.status_code == 200
        tx = resp.json()["data"]
        assert tx["quantity"] == 3
        assert tx["price"] == 15000
        assert "3ea" in mock_notify.call_args.kwargs["body"]

        material = _get_material(client, material_id)
        assert material["status"] == "ACTIVE"
        assert material["quantity"] == 10

    def test_complete_partial_decrements_stock_and_price(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        material_id = _create_material(client, auth_headers, quantity=10)
        tx_id = _buy(client, auth_headers2, material_id, quantity=3).json()["data"]["id"]

        resp = _confirm_and_complete(client, auth_headers, auth_headers2, tx_id)
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "COMPLETED"

        material = _get_material(client, material_id)
        assert material["status"] == "ACTIVE"
        assert material["quantity"] == 7
        assert material["price"] == 35000

    def test_full_quantity_reserves_then_sold(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        material_id = _create_material(client, auth_headers, quantity=10)
        resp = _buy(client, auth_headers2, material_id, quantity=10)
        assert resp.status_code == 200
        assert resp.json()["data"]["price"] == 50000
        assert _get_material(client, material_id)["status"] == "RESERVED"

        tx_id = resp.json()["data"]["id"]
        assert _confirm_and_complete(client, auth_headers, auth_headers2, tx_id).status_code == 200
        assert _get_material(client, material_id)["status"] == "SOLD"

    def test_sold_out_completion_keeps_itself_and_voids_other_open_requests(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        """전체 구매 완료로 SOLD가 되면 close_sale이 남은 요청만 취소하고, 완료된 거래는 유지한다."""
        material_id = _create_material(client, auth_headers, quantity=10)
        partial_id = _buy(client, auth_headers2, material_id, quantity=3).json()["data"]["id"]
        full_id = _buy(client, auth_headers2, material_id, quantity=10).json()["data"]["id"]

        resp = _confirm_and_complete(client, auth_headers, auth_headers2, full_id)
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "COMPLETED"
        assert _get_material(client, material_id)["status"] == "SOLD"

        partial = client.get(f"/api/v1/transactions/{partial_id}", headers=auth_headers2)
        assert partial.json()["data"]["status"] == "CANCELLED"

    def test_quantity_over_stock_returns_409(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        material_id = _create_material(client, auth_headers, quantity=10)
        resp = _buy(client, auth_headers2, material_id, quantity=11)
        assert resp.status_code == 409
        assert "exceeds available stock" in resp.json()["detail"]
        assert _get_material(client, material_id)["status"] == "ACTIVE"

    def test_request_without_quantity_buys_everything(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        """quantity 생략(기존 클라이언트) = 잔여 수량 전체를 원가로 구매."""
        material_id = _create_material(client, auth_headers, quantity=5)
        resp = _buy(client, auth_headers2, material_id)
        assert resp.status_code == 200
        tx = resp.json()["data"]
        assert tx["price"] == 50000
        assert tx["quantity"] == 5
        assert _get_material(client, material_id)["status"] == "RESERVED"

    def test_over_completion_returns_409(
        self, client: TestClient, auth_headers, auth_headers2, superuser_headers
    ):
        """잔여 수량이 다른 부분 거래로 줄어든 뒤엔 초과 거래를 완료할 수 없다."""
        material_id = _create_material(client, auth_headers, quantity=10)
        tx_a = _buy(client, auth_headers2, material_id, quantity=6).json()["data"]["id"]
        tx_b = _buy(client, superuser_headers, material_id, quantity=6).json()["data"]["id"]

        assert _confirm_and_complete(client, auth_headers, auth_headers2, tx_a).status_code == 200
        resp = _confirm_and_complete(client, auth_headers, superuser_headers, tx_b)
        assert resp.status_code == 409

        detail = client.get(f"{TX_PREFIX}/{tx_b}", headers=superuser_headers).json()["data"]
        assert detail["status"] == "CONFIRMED"
        material = _get_material(client, material_id)
        assert material["quantity"] == 4
        assert material["status"] == "ACTIVE"


class TestPartialSaleIntegrity:
    """머지 전 리뷰에서 확인된 분할 거래 무결성 회귀 테스트."""

    def _set_status(self, client, headers, material_id, status):
        resp = client.patch(f"{MAT_PREFIX}/{material_id}/status", json={"status": status}, headers=headers)
        assert resp.status_code == 200, resp.text

    def _tx_status(self, client, headers, tx_id):
        return client.get(f"{TX_PREFIX}/{tx_id}", headers=headers).json()["data"]["status"]

    def test_relist_after_sellout_keeps_earlier_partial_sale(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        material_id = _create_material(client, auth_headers, quantity=10)
        partial_id = _buy(client, auth_headers2, material_id, quantity=3).json()["data"]["id"]
        _confirm_and_complete(client, auth_headers, auth_headers2, partial_id)
        rest_id = _buy(client, auth_headers2, material_id, quantity=7).json()["data"]["id"]
        _confirm_and_complete(client, auth_headers, auth_headers2, rest_id)
        assert _get_material(client, material_id)["status"] == "SOLD"

        # 나머지 7개 거래가 무산돼 다시 판매중으로
        self._set_status(client, auth_headers, material_id, "ACTIVE")
        assert self._tx_status(client, auth_headers2, partial_id) == "COMPLETED"
        assert self._tx_status(client, auth_headers2, rest_id) == "CANCELLED"
        material = _get_material(client, material_id)
        assert (material["quantity"], material["price"]) == (7, 35000)

    def test_relist_after_manual_sold_keeps_partial_sale(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        material_id = _create_material(client, auth_headers, quantity=10)
        partial_id = _buy(client, auth_headers2, material_id, quantity=3).json()["data"]["id"]
        _confirm_and_complete(client, auth_headers, auth_headers2, partial_id)

        # 구매자 지정 없이 판매완료 → 다시 판매중: 부분 판매는 실제 거래이므로 유지
        self._set_status(client, auth_headers, material_id, "SOLD")
        self._set_status(client, auth_headers, material_id, "ACTIVE")
        assert self._tx_status(client, auth_headers2, partial_id) == "COMPLETED"

    def test_double_complete_of_same_partial_tx_deducts_once(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        from app.crud.crud_transaction import crud_transaction
        from app.models.transaction import Transaction
        from app.tests.conftest import TestingSessionLocal

        material_id = _create_material(client, auth_headers, quantity=10)
        tx_id = _buy(client, auth_headers2, material_id, quantity=3).json()["data"]["id"]
        assert client.patch(f"{TX_PREFIX}/{tx_id}/confirm", headers=auth_headers).status_code == 200

        # 양측이 동시에 '완료'를 눌러 두 요청이 모두 CONFIRMED 상태를 읽은 상황
        s1, s2 = TestingSessionLocal(), TestingSessionLocal()
        try:
            t1, t2 = s1.get(Transaction, tx_id), s2.get(Transaction, tx_id)
            crud_transaction.complete_transaction(s1, db_obj=t1)
            with pytest.raises(ValueError):
                crud_transaction.complete_transaction(s2, db_obj=t2)
        finally:
            s1.close()
            s2.close()

        material = _get_material(client, material_id)
        assert (material["quantity"], material["price"]) == (7, 35000)

    def test_create_checks_stock_at_lock_time_not_cached_value(
        self, client: TestClient, auth_headers, test_user2
    ):
        from app.crud.crud_transaction import crud_transaction
        from app.models.material import Material
        from app.tests.conftest import TestingSessionLocal

        material_id = _create_material(client, auth_headers, quantity=10)
        s1, s2 = TestingSessionLocal(), TestingSessionLocal()
        try:
            cached = s1.get(Material, material_id)  # 엔드포인트처럼 먼저 읽어 둔 상태 (수량 10)
            other = s2.get(Material, material_id)
            other.quantity = 2  # 그 사이 판매자가 수량을 2로 수정
            s2.commit()
            with pytest.raises(ValueError, match="exceeds available stock"):
                crud_transaction.create_transaction(
                    s1, material_id=material_id, seller_id=cached.seller_id,
                    buyer_id=test_user2.id, quantity=5,
                )
        finally:
            s1.close()
            s2.close()

    def test_partial_complete_uses_current_lot_price_after_seller_edit(
        self, client: TestClient, auth_headers, auth_headers2
    ):
        from app.models.material import Material
        from app.tests.conftest import TestingSessionLocal

        material_id = _create_material(client, auth_headers, quantity=10)  # 50,000원
        tx_id = _buy(client, auth_headers2, material_id, quantity=8).json()["data"]["id"]  # 40,000원

        s = TestingSessionLocal()
        try:
            s.get(Material, material_id).price = 10000  # 요청 후 판매자가 묶음 가격 인하
            s.commit()
        finally:
            s.close()

        assert _confirm_and_complete(client, auth_headers, auth_headers2, tx_id).status_code == 200
        material = _get_material(client, material_id)
        # 예전 tx.price(40,000)를 빼서 0원이 되지 않고, 현재 가격의 남은 2/10
        assert (material["quantity"], material["price"]) == (2, 2000)
