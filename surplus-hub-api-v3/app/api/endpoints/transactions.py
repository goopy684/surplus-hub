from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.core.notify import notify
from app.crud.crud_material import crud_material
from app.crud.crud_transaction import crud_transaction
from app.models.review import Review
from app.models.user import User
from app.schemas.transaction import TransactionCreate

router = APIRouter()


def _format_transaction(t, has_reviewed: bool = False):
    return {
        "id": t.id,
        "materialId": t.material_id,
        "materialTitle": t.material.title if t.material else None,
        "sellerId": t.seller_id,
        "sellerName": t.seller.name if t.seller else None,
        "buyerId": t.buyer_id,
        "buyerName": t.buyer.name if t.buyer else None,
        "price": t.price,
        "quantity": t.quantity,
        "status": t.status,
        "hasReviewed": bool(has_reviewed),
        "note": t.note,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "confirmedAt": t.confirmed_at.isoformat() if t.confirmed_at else None,
        "completedAt": t.completed_at.isoformat() if t.completed_at else None,
    }


@router.post(
    "/",
    summary="Create Transaction",
    description="Initiate a transaction for a material (buyer action).",
)
def create_transaction(
    tx_in: TransactionCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    material = crud_material.get(db, id=tx_in.material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    if material.seller_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot buy your own material")

    try:
        tx = crud_transaction.create_transaction(
            db,
            material_id=material.id,
            seller_id=material.seller_id,
            buyer_id=current_user.id,
            quantity=tx_in.quantity,
            note=tx_in.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    # Notify the seller of the incoming purchase request
    item = f"'{material.title}'"
    if tx.quantity < (material.quantity or 1):  # 일부 수량 구매
        item += f" {tx.quantity}{material.quantity_unit or '개'}"
    notify(
        db,
        user_id=tx.seller_id,
        type="TRANSACTION",
        title="거래 요청이 도착했어요",
        body=f"{current_user.name}님이 {item} 구매를 요청했습니다.",
        reference_type="material",
        reference_id=material.id,
    )

    return {"status": "success", "data": _format_transaction(tx)}


@router.get(
    "/",
    summary="List My Transactions",
    description="Get current user's transactions (as buyer or seller).",
)
def list_transactions(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    page: int = 1,
    limit: int = 20,
    role: Optional[Literal["seller", "buyer"]] = Query(None, description="Filter by role: 'seller' or 'buyer'"),
) -> Any:
    skip = (page - 1) * limit
    transactions, total = crud_transaction.get_user_transactions(
        db, user_id=current_user.id, skip=skip, limit=limit, role=role
    )

    material_ids = [t.material_id for t in transactions if t.material_id is not None]
    reviewed_material_ids = set()
    if material_ids:
        rows = (
            db.query(Review.material_id)
            .filter(
                Review.reviewer_id == current_user.id,
                Review.material_id.in_(material_ids),
            )
            .all()
        )
        reviewed_material_ids = {r[0] for r in rows if r[0] is not None}

    total_pages = (total + limit - 1) // limit if total > 0 else 0

    return {
        "status": "success",
        "data": [
            _format_transaction(t, has_reviewed=(t.material_id in reviewed_material_ids))
            for t in transactions
        ],
        "meta": {
            "totalCount": total,
            "page": page,
            "limit": limit,
            "hasNextPage": page < total_pages,
            "totalPages": total_pages,
        },
    }


@router.get(
    "/{transaction_id}",
    summary="Get Transaction Detail",
)
def get_transaction(
    transaction_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    tx = crud_transaction.get(db, id=transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Only participants can view
    if tx.seller_id != current_user.id and tx.buyer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    has_reviewed = (
        db.query(Review.id)
        .filter(Review.reviewer_id == current_user.id, Review.material_id == tx.material_id)
        .first()
        is not None
    )
    return {"status": "success", "data": _format_transaction(tx, has_reviewed=has_reviewed)}


@router.patch(
    "/{transaction_id}/confirm",
    summary="Confirm Transaction",
    description="Seller confirms the transaction.",
)
def confirm_transaction(
    transaction_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    tx = crud_transaction.get(db, id=transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only seller can confirm")

    if tx.status != "PENDING":
        raise HTTPException(status_code=400, detail="Transaction is not pending")

    tx = crud_transaction.confirm_transaction(db, db_obj=tx)

    # Notify the buyer that the seller accepted
    notify(
        db,
        user_id=tx.buyer_id,
        type="TRANSACTION",
        title="거래가 확정되었어요",
        body=f"{current_user.name}님이 거래를 확정했습니다.",
        reference_type="material",
        reference_id=tx.material_id,
    )

    return {"status": "success", "data": _format_transaction(tx)}


@router.patch(
    "/{transaction_id}/complete",
    summary="Complete Transaction",
    description="Mark transaction as completed (either party).",
)
def complete_transaction(
    transaction_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    tx = crud_transaction.get(db, id=transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.seller_id != current_user.id and tx.buyer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if tx.status != "CONFIRMED":
        raise HTTPException(status_code=400, detail="Transaction must be confirmed first")

    try:
        tx = crud_transaction.complete_transaction(db, db_obj=tx)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return {"status": "success", "data": _format_transaction(tx)}
