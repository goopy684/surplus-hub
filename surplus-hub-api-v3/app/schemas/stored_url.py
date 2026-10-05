from typing import Annotated

from pydantic import AfterValidator, StringConstraints


def _reject_inline_data(v: str) -> str:
    if v.lstrip().lower().startswith("data:"):
        raise ValueError("Inline data URLs are not allowed; upload the file via /api/v1/upload/image")
    return v


# Image URL persisted to the DB: must point at uploaded storage, never embed the file
# (a single base64 photo once made the material list response 12MB).
StoredUrl = Annotated[str, StringConstraints(max_length=2048), AfterValidator(_reject_inline_data)]
