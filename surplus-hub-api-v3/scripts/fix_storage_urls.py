"""Rewrite stored upload URLs that point at the nonexistent AWS-style host (SH-36, idempotent).

Before SH-36, uploads on R2 (region=auto) were saved as
https://<bucket>.s3.auto.amazonaws.com/<key> (NXDOMAIN). This swaps that prefix for
STORAGE_PUBLIC_BASE_URL. Rows already rewritten no longer match, so reruns are no-ops.

Usage (needs DATABASE_URL and STORAGE_PUBLIC_BASE_URL in the environment):
    python -m scripts.fix_storage_urls            # dry run: counts only, rolls back
    python -m scripts.fix_storage_urls --apply
    python -m scripts.fix_storage_urls --from-prefix https://surplus-hub-uploads.s3.auto.amazonaws.com/
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.core.config import settings

# (table, url column). messages: IMAGE messages carry the URL as their content.
COLUMNS = [
    ("material_images", "url"),
    ("posts", "image_url"),
    ("events", "image_url"),
    ("users", "profile_image_url"),
    ("messages", "content"),
]


def fix_urls(db, old_prefix: str, new_prefix: str) -> dict:
    """Rewrite old_prefix → new_prefix in every URL column. Caller commits or rolls back."""
    counts = {}
    for table, col in COLUMNS:
        # substr 비교: LIKE면 버킷명의 '_'가 와일드카드가 된다
        result = db.execute(
            text(
                f"UPDATE {table} SET {col} = :new || substr({col}, :n + 1) "
                f"WHERE substr({col}, 1, :n) = :old"
            ),
            {"old": old_prefix, "new": new_prefix, "n": len(old_prefix)},
        )
        counts[f"{table}.{col}"] = result.rowcount
    return counts


def main(argv: list) -> None:
    from app.db.session import SessionLocal

    if not settings.STORAGE_PUBLIC_BASE_URL:
        sys.exit("STORAGE_PUBLIC_BASE_URL is not set")
    old_prefix = f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_S3_REGION}.amazonaws.com/"
    if "--from-prefix" in argv:
        old_prefix = argv[argv.index("--from-prefix") + 1]
    new_prefix = settings.STORAGE_PUBLIC_BASE_URL.rstrip("/") + "/"
    if old_prefix == new_prefix:
        sys.exit("old and new prefix are identical")

    print(f"{old_prefix} -> {new_prefix}")
    db = SessionLocal()
    try:
        for column, n in fix_urls(db, old_prefix, new_prefix).items():
            print(f"{column}: {n}")
        if "--apply" not in argv:
            db.rollback()
            print("dry run — rerun with --apply")
            return
        db.commit()
        print("applied")
    finally:
        db.close()


if __name__ == "__main__":
    main(sys.argv[1:])
