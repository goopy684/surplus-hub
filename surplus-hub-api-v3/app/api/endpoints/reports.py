from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_moderation import crud_moderation
from app.models.moderation import Report
from app.models.user import User
from app.schemas.moderation import ReportCreate, ReportResponse

router = APIRouter()

VALID_TARGET_TYPES = {"user", "material", "post", "comment"}
VALID_REASONS = {"spam", "abuse", "fraud", "inappropriate", "other"}


@router.post("", summary="Create a report", status_code=201)
def create_report(
    data: ReportCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if data.target_type not in VALID_TARGET_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid target_type. Must be one of: {', '.join(VALID_TARGET_TYPES)}",
        )
    if data.reason not in VALID_REASONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid reason. Must be one of: {', '.join(VALID_REASONS)}",
        )
    if data.target_type == "user" and data.target_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot report yourself")

    duplicate = HTTPException(status_code=409, detail="You have already reported this")
    if db.query(Report.id).filter(
        Report.reporter_id == current_user.id,
        Report.target_type == data.target_type,
        Report.target_id == data.target_id,
    ).first():
        raise duplicate
    try:
        report = crud_moderation.create_report(db, reporter_id=current_user.id, data=data)
    except IntegrityError:  # 동시 요청: uq_report_pending_reporter_target
        db.rollback()
        raise duplicate
    return {"status": "success", "data": ReportResponse.model_validate(report)}
