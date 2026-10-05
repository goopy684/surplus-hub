from typing import List, Optional
from datetime import datetime, timezone

from sqlalchemy import desc, or_, select
from sqlalchemy.orm import Session, joinedload

from app.crud.base import CRUDBase
from app.models.chat import ChatRoom
from app.models.material import Material
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate


class CRUDTransaction(CRUDBase[Transaction, TransactionCreate, dict]):
    def create_transaction(
        self,
        db: Session,
        *,
        material_id: int,
        seller_id: int,
        buyer_id: int,
        price: int,
        note: Optional[str] = None,
    ) -> Transaction:
        # Lock the material row to prevent race conditions
        material = db.execute(
            select(Material).where(Material.id == material_id).with_for_update()
        ).scalar_one_or_none()

        if not material or material.status != "ACTIVE":
            raise ValueError("Material is not available for transaction")

        # Atomically reserve the material
        material.status = "RESERVED"

        db_obj = Transaction(
            material_id=material_id,
            seller_id=seller_id,
            buyer_id=buyer_id,
            price=price,
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
        db_obj.status = "COMPLETED"
        db_obj.completed_at = datetime.now(timezone.utc)
        db.add(db_obj)
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
        """Seller put a SOLD listing back on sale: the sale didn't happen. Caller commits."""
        db.query(Transaction).filter(
            Transaction.material_id == material_id,
            Transaction.status == "COMPLETED",
        ).update({"status": "CANCELLED"}, synchronize_session=False)


crud_transaction = CRUDTransaction(Transaction)
