from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_admin import crud_admin
from app.crud.crud_moderation import crud_moderation
from app.models.user import User
from app.schemas.moderation import (
    ReportResponse,
    ReportUpdateStatus,
    ModerationQueueResponse,
    BulkActionRequest,
    BannedWordCreate,
    BannedWordResponse,
)

router = APIRouter()

VALID_REPORT_STATUSES = {"pending", "reviewed", "resolved", "dismissed"}


@router.get("/reports", summary="List reports (MODERATOR+)")
def list_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    if status and status not in VALID_REPORT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(VALID_REPORT_STATUSES)}",
        )
    reports, total = crud_moderation.get_reports(db, skip=skip, limit=limit, status_filter=status)
    items = [ReportResponse.model_validate(r) for r in reports]
    return {"status": "success", "data": {"items": items, "total": total}}


@router.patch("/reports/{report_id}", summary="Update report status (MODERATOR+)")
def update_report_status(
    report_id: int,
    data: ReportUpdateStatus,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    valid_update_statuses = {"reviewed", "resolved", "dismissed"}
    if data.status not in valid_update_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(valid_update_statuses)}",
        )

    report = crud_moderation.get_report(db, report_id=report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    old_status = report.status
    updated = crud_moderation.update_report_status(
        db, report_id=report_id, status=data.status, reviewed_by=current_user.id
    )
    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="UPDATE_REPORT_STATUS",
        target_type="report",
        target_id=report_id,
        details={"oldStatus": old_status, "newStatus": data.status},
        ip_address=deps.get_client_ip(request),
    )
    return {"status": "success", "data": ReportResponse.model_validate(updated)}


@router.get("/queue", summary="Combined moderation queue (MODERATOR+)")
def get_moderation_queue(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    queue = crud_moderation.get_moderation_queue(db, skip=skip, limit=limit)
    items = [ModerationQueueResponse.model_validate(item) for item in queue]
    return {"status": "success", "data": {"items": items, "total": len(items)}}


@router.post("/bulk", summary="Bulk process reports (ADMIN+)")
def bulk_process(
    data: BulkActionRequest,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    try:
        count = crud_moderation.bulk_process(
            db, ids=data.ids, action=data.action, admin_id=current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="BULK_PROCESS_REPORTS",
        target_type="report",
        details={"ids": data.ids, "action": data.action, "processed": count},
        ip_address=deps.get_client_ip(request),
    )
    return {"status": "success", "data": {"processed": count}}


@router.get("/banned-words", summary="List banned words (MODERATOR+)")
def list_banned_words(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("MODERATOR")),
) -> Any:
    words = crud_moderation.get_banned_words(db)
    items = [BannedWordResponse.model_validate(w) for w in words]
    return {"status": "success", "data": {"items": items, "total": len(items)}}


@router.post("/banned-words", summary="Add banned word (ADMIN+)", status_code=201)
def create_banned_word(
    data: BannedWordCreate,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    if not data.word.strip():
        raise HTTPException(status_code=400, detail="word must not be blank")
    try:
        word = crud_moderation.create_banned_word(
            db, word=data.word, created_by=current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="ADD_BANNED_WORD",
        target_type="banned_word",
        target_id=word.id,
        details={"word": word.word},
        ip_address=deps.get_client_ip(request),
    )
    return {"status": "success", "data": BannedWordResponse.model_validate(word)}


@router.delete("/banned-words/{word_id}", summary="Delete banned word (ADMIN+)")
def delete_banned_word(
    word_id: int,
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_admin_user("ADMIN")),
) -> Any:
    word = crud_moderation.delete_banned_word(db, word_id=word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Banned word not found")
    crud_admin.create_audit_log(
        db,
        admin_id=current_user.id,
        action="REMOVE_BANNED_WORD",
        target_type="banned_word",
        target_id=word_id,
        details={"word": word.word},
        ip_address=deps.get_client_ip(request),
    )
    return {"status": "success", "data": BannedWordResponse.model_validate(word)}
