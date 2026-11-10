import logging
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.deps import get_current_active_user, get_db
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.storage import storage
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


class PresignedUrlRequest(BaseModel):
    filename: str
    content_type: str = Field(alias="contentType", default="image/jpeg")
    folder: str = "materials"

    model_config = {"populate_by_name": True}


class PresignedUrlResponse(BaseModel):
    upload_url: str = Field(alias="uploadUrl")
    public_url: str = Field(alias="publicUrl")
    key: str
    expires_in: int = Field(alias="expiresIn")

    model_config = {"populate_by_name": True}


class UploadResponse(BaseModel):
    url: str


@router.post(
    "/image",
    response_model=UploadResponse,
    summary="Upload Image",
    description="Upload an image file directly (multipart/form-data).",
)
@limiter.limit("20/minute")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    # Validate content type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    # Read file content
    content = await file.read()

    # Validate file size
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # Upload to S3
    try:
        url = storage.upload_file(
            file_content=content,
            filename=file.filename or "image.jpg",
            content_type=file.content_type or "image/jpeg",
            folder="materials",
        )
    except Exception:
        logger.exception("image upload failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to upload image. Please try again.",
        )

    return {"url": url}


@router.post(
    "/presigned-url",
    response_model=PresignedUrlResponse,
    summary="Get Presigned URL",
    description="Get a presigned URL for direct upload to S3 from the client.",
)
def get_presigned_url(
    request: PresignedUrlRequest,
    current_user: User = Depends(get_current_active_user),
):
    if request.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    try:
        result = storage.generate_presigned_url(
            filename=request.filename,
            content_type=request.content_type,
            folder=request.folder,
        )
    except Exception:
        logger.exception("presigned URL generation failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate presigned URL.",
        )

    return result
