import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_dashboard import crud_dashboard
from app.models.user import User

router = APIRouter()

_VALID_EXPORT_TYPES = {"users", "materials", "transactions"}


@router.get("/summary", summary="Dashboard KPI summary")
def get_dashboard_summary(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    summary = crud_dashboard.get_summary(db)
    return {"status": "success", "data": summary}


@router.get("/stats/users", summary="User registration trend")
def get_user_stats(
    period: str = Query("day", pattern="^(day|week|month)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    data = crud_dashboard.get_user_stats(db, period=period, days=days)
    return {"status": "success", "data": {"data": data, "period": period}}


@router.get("/stats/materials", summary="Material listing trend")
def get_material_stats(
    period: str = Query("day", pattern="^(day|week|month)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    data = crud_dashboard.get_material_stats(db, period=period, days=days)
    return {"status": "success", "data": {"data": data, "period": period}}


@router.get("/stats/transactions", summary="Transaction trend")
def get_transaction_stats(
    period: str = Query("day", pattern="^(day|week|month)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    data = crud_dashboard.get_transaction_stats(db, period=period, days=days)
    return {"status": "success", "data": {"data": data, "period": period}}


@router.get("/stats/active-users", summary="Distinct active users trend (DAU/WAU/MAU)")
def get_active_user_stats(
    period: str = Query("day", pattern="^(day|week|month)$"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    data = crud_dashboard.get_active_user_stats(db, period=period, days=days)
    return {"status": "success", "data": {"data": data, "period": period}}


@router.get("/export/{export_type}", summary="Export data as CSV (ADMIN+ required)")
def export_data(
    export_type: str,
    start_date: str = Query(None, alias="startDate"),
    end_date: str = Query(None, alias="endDate"),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    if export_type not in _VALID_EXPORT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid export_type. Must be one of: {', '.join(_VALID_EXPORT_TYPES)}",
        )
    csv_content = crud_dashboard.export_csv(db, export_type, start_date=start_date, end_date=end_date)
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={export_type}_export.csv"},
    )
