
import os
import shutil
import uuid
from datetime import datetime
from typing import Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings


def public_url(key: str) -> str:
    """Public URL of an uploaded object."""
    if settings.STORAGE_PUBLIC_BASE_URL:
        return f"{settings.STORAGE_PUBLIC_BASE_URL.rstrip('/')}/{key}"
    if settings.AWS_S3_ENDPOINT_URL:
        # S3 호환 스토리지(R2 등)의 API endpoint는 공개 주소가 아니고, AWS 형식으로 만들면
        # 존재하지 않는 호스트(…s3.auto.amazonaws.com)가 된다 — 깨진 URL을 저장하느니 업로드를 실패시킨다.
        raise RuntimeError("STORAGE_PUBLIC_BASE_URL must be set when AWS_S3_ENDPOINT_URL is set")
    return f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_S3_REGION}.amazonaws.com/{key}"


class BaseStorage:
    def _generate_key(self, folder: str, filename: str) -> str:
        """Generate a unique key."""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
        date_prefix = datetime.utcnow().strftime("%Y/%m/%d")
        unique_id = uuid.uuid4().hex[:12]
        return f"{folder}/{date_prefix}/{unique_id}.{ext}"


class S3Storage(BaseStorage):
    """S3 file storage client."""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            kwargs = {
                "service_name": "s3",
                "region_name": settings.AWS_S3_REGION,
                "config": Config(
                    connect_timeout=5,
                    read_timeout=10,
                    retries={"max_attempts": 2},
                ),
            }
            if settings.AWS_ACCESS_KEY_ID:
                kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
                kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
            if settings.AWS_S3_ENDPOINT_URL:
                # S3-compatible storage (Cloudflare R2 등) — explicit endpoint.
                kwargs["endpoint_url"] = settings.AWS_S3_ENDPOINT_URL
            self._client = boto3.client(**kwargs)
        return self._client

    def upload_file(
        self,
        file_content: bytes,
        filename: str,
        content_type: str,
        folder: str = "materials",
    ) -> str:
        """Upload a file to S3 and return the public URL."""
        key = self._generate_key(folder, filename)
        url = public_url(key)  # 설정 오류면 객체를 올리기 전에 실패

        self.client.put_object(
            Bucket=settings.AWS_S3_BUCKET_NAME,
            Key=key,
            Body=file_content,
            ContentType=content_type,
            # Keys are unique per upload, so the object never changes — let CDN/browsers keep it.
            CacheControl="public, max-age=31536000, immutable",
        )
        return url

    def generate_presigned_url(
        self,
        filename: str,
        content_type: str,
        folder: str = "materials",
        expires_in: int = 3600,
    ) -> dict:
        """Generate a presigned URL for direct upload from client."""
        key = self._generate_key(folder, filename)
        url = public_url(key)

        presigned_url = self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.AWS_S3_BUCKET_NAME,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )

        return {
            "uploadUrl": presigned_url,
            "publicUrl": url,
            "key": key,
            "expiresIn": expires_in,
        }

    def delete_file(self, key: str) -> bool:
        """Delete a file from S3."""
        try:
            self.client.delete_object(
                Bucket=settings.AWS_S3_BUCKET_NAME,
                Key=key,
            )
            return True
        except ClientError:
            return False


class LocalStorage(BaseStorage):
    """Local file storage client for development."""

    BASE_DIR = "static/uploads"

    def __init__(self):
        os.makedirs(self.BASE_DIR, exist_ok=True)

    @property
    def base_url(self) -> str:
        return f"{settings.BASE_URL}/static/uploads"

    def upload_file(
        self,
        file_content: bytes,
        filename: str,
        content_type: str,
        folder: str = "materials",
    ) -> str:
        key = self._generate_key(folder, filename)
        file_path = os.path.join(self.BASE_DIR, key)
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, "wb") as f:
            f.write(file_content)
            
        return f"{self.base_url}/{key}"

    def generate_presigned_url(
        self,
        filename: str,
        content_type: str,
        folder: str = "materials",
        expires_in: int = 3600,
    ) -> dict:
        # Local storage doesn't support direct upload URL, fallback to direct upload
        raise NotImplementedError("Presigned URL not supported in local storage")

    def delete_file(self, key: str) -> bool:
        file_path = os.path.join(self.BASE_DIR, key)
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False


# Determine storage backend
if settings.AWS_ACCESS_KEY_ID:
    storage = S3Storage()
else:
    storage = LocalStorage()
