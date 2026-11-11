from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.cache import cache_get_json, cache_set_json, make_cache_key
from app.crud.crud_event import crud_event
from app.schemas.event import EventResponse

router = APIRouter()


@router.get(
    "/",
    summary="List Events",
    description="Get active events and promotions.",
)
def list_events(
    db: Session = Depends(deps.get_db),
    page: int = 1,
    limit: int = 20,
) -> Any:
    skip = (page - 1) * limit
    key = make_cache_key("events:list", skip=skip, limit=limit)
    cached = cache_get_json(key)
    if cached is not None:
        return cached

    events, total = crud_event.get_active_events(db, skip=skip, limit=limit)

    total_pages = (total + limit - 1) // limit if total > 0 else 0

    result = {
        "status": "success",
        "data": [EventResponse.model_validate(e).model_dump(mode="json", by_alias=True) for e in events],
        "meta": {
            "totalCount": total,
            "page": page,
            "limit": limit,
            "hasNextPage": page < total_pages,
            "totalPages": total_pages,
        },
    }
    cache_set_json(key, result, ttl_seconds=300)
    return result


@router.get(
    "/{event_id}",
    summary="Get Event Detail",
)
def get_event(
    event_id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    event = crud_event.get(db, id=event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return {
        "status": "success",
        "data": EventResponse.model_validate(event),
    }
