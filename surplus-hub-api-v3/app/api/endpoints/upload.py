import base64
import binascii
import logging
from typing import List, Optional

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


class Base64UploadRequest(BaseModel):
    data_url: str = Field(alias="dataUrl")
    filename: str = "image.jpg"
    folder: str = Field(default="materials", pattern=r"^[A-Za-z0-9_-]{1,32}$")

    model_config = {"populate_by_name": True}


# 모바일 브라우저가 보내는 비표준 MIME → 표준 MIME
_MIME_ALIASES = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-png": "image/png",
}
_EXTENSION_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "heic": "image/heic",
    "heif": "image/heif",
}
_HEIF_BRANDS = {b"heic": "image/heic", b"heif": "image/heif", b"mif1": "image/heif"}


def _sniff_image_type(content: bytes) -> Optional[str]:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    if content[4:8] == b"ftyp":
        return _HEIF_BRANDS.get(content[8:12])
    return None


def _resolve_image_content_type(
    content_type: Optional[str], filename: Optional[str], content: bytes
) -> Optional[str]:
    """허용 이미지 MIME을 돌려주고, 허용할 수 없으면 None.

    일부 모바일 브라우저는 content-type을 비우거나(octet-stream) 비표준 이름으로 보낸다.
    그 경우에만 매직 바이트·확장자로 보정하고, 명시적으로 다른 타입(gif 등)이면 거절한다.
    """
    ctype = (content_type or "").split(";", 1)[0].strip().lower()
    ctype = _MIME_ALIASES.get(ctype, ctype)
    if ctype in ALLOWED_IMAGE_TYPES:
        return ctype
    if ctype not in ("", "application/octet-stream"):
        return None
    ext = filename.rsplit(".", 1)[-1].lower() if filename and "." in filename else ""
    return _sniff_image_type(content) or _EXTENSION_TYPES.get(ext)


def _store_image(content: bytes, filename: Optional[str], content_type: str, folder: str = "materials") -> str:
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )
    try:
        return storage.upload_file(
            file_content=content,
            filename=filename or "image.jpg",
            content_type=content_type,
            folder=folder,
        )
    except Exception:
        logger.exception("image upload failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to upload image. Please try again.",
        )


def _reject_type() -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=f"File type not allowed. Allowed: {', '.join(sorted(ALLOWED_IMAGE_TYPES))}",
    )


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
    content = await file.read()
    content_type = _resolve_image_content_type(file.content_type, file.filename, content)
    if content_type is None:
        raise _reject_type()

    return {"url": _store_image(content, file.filename, content_type)}


@router.post(
    "/image-base64",
    response_model=UploadResponse,
    summary="Upload Image (base64 data URL)",
    description="multipart 전송이 막히는 모바일 인앱 브라우저용 JSON 폴백. `data:<mime>;base64,<payload>`.",
)
@limiter.limit("20/minute")
async def upload_image_base64(
    request: Request,
    body: Base64UploadRequest,
    current_user: User = Depends(get_current_active_user),
):
    header, sep, payload = body.data_url.partition(",")
    if not sep or not header.startswith("data:") or not header.endswith(";base64"):
        raise HTTPException(status_code=400, detail="Invalid data URL")
    try:
        content = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid base64 payload")

    content_type = _resolve_image_content_type(header[len("data:"):-len(";base64")], body.filename, content)
    if content_type is None:
        raise _reject_type()

    return {"url": _store_image(content, body.filename, content_type, body.folder)}


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
