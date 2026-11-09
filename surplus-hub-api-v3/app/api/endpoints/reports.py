from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_moderation import crud_moderation
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

    try:
        report = crud_moderation.create_report(db, reporter_id=current_user.id, data=data)
    except IntegrityError:  # uq_report_reporter_target
        db.rollback()
        raise HTTPException(status_code=409, detail="You have already reported this")
    return {"status": "success", "data": ReportResponse.model_validate(report)}
