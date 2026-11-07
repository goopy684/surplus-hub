from typing import List, Optional
from datetime import datetime, timezone

from sqlalchemy import desc, or_, select
from sqlalchemy.orm import Session, joinedload

from app.crud.base import CRUDBase
from app.models.chat import ChatRoom
from app.models.material import Material
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate


def split_price(price: int, quantity: int, available: int) -> int:
    """수량 비례 가격. 프론트 calcSplitPrice(Math.round(price*q/available))와 같은 값이어야 한다."""
    if price <= 0 or quantity >= available:  # 무료나눔은 일부 수량도 0원
        return price
    # 정수 반올림(half-up): round(price*q/available)
    return max(1, (2 * price * quantity + available) // (2 * available))


def _lock_material(db: Session, material_id: int) -> Optional[Material]:
    # Lock the material row to prevent race conditions
    # populate_existing: 엔드포인트가 이미 읽어 둔 객체가 세션에 있어도 잠금 시점 값으로 다시 채운다
    return db.execute(
        select(Material)
        .where(Material.id == material_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()


class CRUDTransaction(CRUDBase[Transaction, TransactionCreate, dict]):
    def create_transaction(
        self,
        db: Session,
        *,
        material_id: int,
        seller_id: int,
        buyer_id: int,
        quantity: Optional[int] = None,
        note: Optional[str] = None,
    ) -> Transaction:
        material = _lock_material(db, material_id)

        if not material or material.status != "ACTIVE":
            raise ValueError("Material is not available for transaction")

        available = material.quantity or 1
        quantity = quantity or available
        if quantity > available:
            raise ValueError(
                f"Requested quantity ({quantity}) exceeds available stock ({available})"
            )

        # 전체 구매만 예약 처리. 일부 구매는 남은 수량을 다른 구매자가 살 수 있게 ACTIVE 유지
        if quantity == available:
            material.status = "RESERVED"

        db_obj = Transaction(
            material_id=material_id,
            seller_id=seller_id,
            buyer_id=buyer_id,
            price=split_price(material.price, quantity, available),
            quantity=quantity,
            note=note,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_user_transactions(
        self, db: Session, *, user_id: int, skip: int = 0, limit: int = 20, role: Optional[str] = None
    ) -> tuple[List[Transaction], int]:
        query = db.query(Transaction).options(
            joinedload(Transaction.seller),
            joinedload(Transaction.buyer),
            joinedload(Transaction.material),
        )

        if role == "seller":
            query = query.filter(Transaction.seller_id == user_id)
        elif role == "buyer":
            query = query.filter(Transaction.buyer_id == user_id)
        else:
            query = query.filter(
                or_(
                    Transaction.seller_id == user_id,
                    Transaction.buyer_id == user_id,
                )
            )

        query = query.order_by(desc(Transaction.created_at))

        total = query.count()
        items = query.offset(skip).limit(limit).all()
        return items, total

    def confirm_transaction(
        self, db: Session, *, db_obj: Transaction
    ) -> Transaction:
        db_obj.status = "CONFIRMED"
        db_obj.confirmed_at = datetime.now(timezone.utc)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def complete_transaction(
        self, db: Session, *, db_obj: Transaction
    ) -> Transaction:
        material = _lock_material(db, db_obj.material_id)
        # 같은 거래를 양측이 동시에 완료(또는 재시도)해도 재고를 두 번 차감하지 않도록 잠금 후 다시 확인
        db.refresh(db_obj, with_for_update=True)
        if db_obj.status != "CONFIRMED":
            raise ValueError("Transaction is not confirmed")
        sold = False
        if material:
            remaining = material.quantity or 1
            quantity = db_obj.quantity
            if quantity is not None and quantity > remaining:
                raise ValueError(
                    f"Not enough stock left to complete ({quantity} requested, {remaining} left)"
                )
            if quantity is None or quantity == remaining:
                sold = True
            elif material.status == "SOLD":
                raise ValueError("Material is already sold")
            else:
                # 일부 수량 판매: 잔여 수량·가격 차감 후 계속 판매
                # 가격은 요청 시점 tx.price가 아니라 현재 묶음 가격 기준으로 차감 (요청 후 판매자가 가격을 바꿨을 수 있음)
                material.price = max(0, material.price - split_price(material.price, quantity, remaining))
                material.quantity = remaining - quantity
                db_obj.is_partial = True
                # 남은 수량으로는 기존 전체 구매 예약을 채울 수 없으므로 예약을 풀어준다
                if material.status == "RESERVED":
                    material.status = "ACTIVE"

        db_obj.status = "COMPLETED"
        db_obj.completed_at = datetime.now(timezone.utc)
        db.add(db_obj)
        if sold:
            # crud_material이 이 모듈을 import하므로 순환 import를 피해 여기서 가져온다.
            from app.crud.crud_material import crud_material

            # close_sale이 남은 PENDING/CONFIRMED 요청을 DB에서 조회해 취소하므로,
            # 이 거래의 COMPLETED를 먼저 flush해야 함께 취소되지 않는다.
            db.flush()
            # update_status commits, voids other open requests (close_sale) and notifies likers
            crud_material.update_status(db, db_obj=material, status="SOLD")
        else:
            db.commit()
        db.refresh(db_obj)
        return db_obj

    def close_sale(
        self, db: Session, *, material: Material, buyer_id: Optional[int]
    ) -> None:
        """Listing is going SOLD: record the sale to buyer_id (if named) and void other open requests.

        Sellers mark SOLD themselves, so this is where most completed transactions
        come from. The buyer must have chatted about this listing — anything else
        would let a seller fabricate sales (and reviews) with arbitrary users.
        Caller commits.
        """
        if buyer_id is not None and not db.query(ChatRoom.id).filter(
            ChatRoom.material_id == material.id,
            ChatRoom.seller_id == material.seller_id,
            ChatRoom.buyer_id == buyer_id,
        ).first():
            raise ValueError("buyerId must be a chat partner on this material")

        open_txs = db.query(Transaction).filter(
            Transaction.material_id == material.id,
            Transaction.status.in_(("PENDING", "CONFIRMED")),
        ).all()
        sale = next((t for t in open_txs if t.buyer_id == buyer_id), None)
        for t in open_txs:
            if t is not sale:
                t.status = "CANCELLED"
        if buyer_id is None:
            return

        now = datetime.now(timezone.utc)
        if sale is None:
            sale = Transaction(
                material_id=material.id,
                seller_id=material.seller_id,
                buyer_id=buyer_id,
                price=material.price,
                confirmed_at=now,
            )
            db.add(sale)
        sale.status = "COMPLETED"
        sale.completed_at = now

    def cancel_completed(self, db: Session, *, material_id: int) -> None:
        """Seller put a SOLD listing back on sale: the sale didn't happen. Caller commits.

        매물이 판매중으로 남았던 일부 수량 판매(is_partial)는 실제로 성사된 거래이므로 유지한다.
        """
        db.query(Transaction).filter(
            Transaction.material_id == material_id,
            Transaction.status == "COMPLETED",
            Transaction.is_partial.is_(False),
        ).update({"status": "CANCELLED"}, synchronize_session=False)


crud_transaction = CRUDTransaction(Transaction)
