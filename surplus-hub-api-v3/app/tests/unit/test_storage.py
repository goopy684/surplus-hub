"""SH-36: upload URLs must use the configured public base, never a made-up AWS host for R2."""

from unittest.mock import MagicMock, patch

import pytest

from app.core import storage
from app.core.config import settings

R2 = {"AWS_S3_ENDPOINT_URL": "https://acct.r2.cloudflarestorage.com", "AWS_S3_REGION": "auto"}


def _settings(**values):
    return patch.multiple(settings, **{"STORAGE_PUBLIC_BASE_URL": None, "AWS_S3_ENDPOINT_URL": None, **values})


def test_public_base_url_wins():
    with _settings(**R2, STORAGE_PUBLIC_BASE_URL="https://pub-abc.r2.dev/"):
        assert storage.public_url("materials/a.jpg") == "https://pub-abc.r2.dev/materials/a.jpg"


def test_plain_aws_falls_back_to_s3_host():
    with _settings(AWS_S3_REGION="ap-northeast-2"):
        assert storage.public_url("k.jpg") == (
            f"https://{settings.AWS_S3_BUCKET_NAME}.s3.ap-northeast-2.amazonaws.com/k.jpg"
        )


def test_r2_without_public_base_fails_before_uploading():
    s3 = storage.S3Storage()
    s3._client = MagicMock()
    with _settings(**R2), pytest.raises(RuntimeError, match="STORAGE_PUBLIC_BASE_URL"):
        s3.upload_file(b"x", "a.jpg", "image/jpeg")
    s3._client.put_object.assert_not_called()


def test_upload_sets_immutable_cache_control():
    s3 = storage.S3Storage()
    s3._client = MagicMock()
    with _settings(**R2, STORAGE_PUBLIC_BASE_URL="https://cdn.example.com"):
        s3.upload_file(b"x", "a.jpg", "image/jpeg")
    assert s3._client.put_object.call_args.kwargs["CacheControl"] == "public, max-age=31536000, immutable"


def test_presigned_public_url_uses_base():
    s3 = storage.S3Storage()
    s3._client = MagicMock()
    s3._client.generate_presigned_url.return_value = "https://acct.r2.cloudflarestorage.com/signed"
    with _settings(**R2, STORAGE_PUBLIC_BASE_URL="https://cdn.example.com"):
        result = s3.generate_presigned_url("a.png", "image/png")
    assert result["publicUrl"] == f"https://cdn.example.com/{result['key']}"


def test_fix_storage_urls_rewrites_once(test_user):
    from sqlalchemy import text

    from app.tests.conftest import TestingSessionLocal
    from scripts.fix_storage_urls import fix_urls

    old = "https://surplus-hub-uploads.s3.auto.amazonaws.com/"
    new = "https://pub-abc.r2.dev/"
    get = text("SELECT profile_image_url FROM users WHERE id = :i")
    put = text("UPDATE users SET profile_image_url = :u WHERE id = :i")
    s = TestingSessionLocal()
    try:
        original = s.execute(get, {"i": test_user.id}).scalar()
        s.execute(put, {"u": old + "profiles/x.jpg", "i": test_user.id})
        assert fix_urls(s, old, new)["users.profile_image_url"] == 1
        assert fix_urls(s, old, new)["users.profile_image_url"] == 0  # idempotent
        assert s.execute(get, {"i": test_user.id}).scalar() == new + "profiles/x.jpg"
        s.execute(put, {"u": original, "i": test_user.id})
        s.commit()
    finally:
        s.close()


def test_fix_storage_urls_only_rewrites_image_messages():
    """사용자가 텍스트 메시지로 붙여 넣은 같은 주소는 바꾸지 않는다."""
    from sqlalchemy import text

    from app.tests.conftest import TestingSessionLocal
    from scripts.fix_storage_urls import fix_urls

    old, new = "https://surplus-hub-uploads.s3.auto.amazonaws.com/", "https://pub-abc.r2.dev/"
    s = TestingSessionLocal()
    try:
        ids = []
        for kind in ("IMAGE", "TEXT"):
            ids.append(s.execute(
                text("INSERT INTO messages (content, message_type, is_read) VALUES (:c, :t, false) RETURNING id"),
                {"c": old + "chat/x.jpg", "t": kind},
            ).scalar())
        assert fix_urls(s, old, new)["messages.content"] == 1
        got = dict(s.execute(text("SELECT message_type, content FROM messages WHERE id IN (:a, :b)"),
                             {"a": ids[0], "b": ids[1]}).all())
        assert got == {"IMAGE": new + "chat/x.jpg", "TEXT": old + "chat/x.jpg"}
    finally:
        s.rollback()
        s.close()
