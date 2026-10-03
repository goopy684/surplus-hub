"""Verify Google Identity Services ID tokens (RS256) for social login.

Uses the existing PyJWT dependency (no extra packages). The frontend obtains a
Google ID token via Google Identity Services and posts it to /auth/google; this
module validates the signature against Google's public keys plus the audience
(our GOOGLE_CLIENT_ID), issuer, and expiry.
"""
import jwt
from jwt import PyJWKClient

from app.core.config import settings

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

# Lazy: no network call until the first token verification.
_jwks_client = PyJWKClient(GOOGLE_CERTS_URL)


class GoogleAuthError(Exception):
    """Raised when a Google ID token fails verification."""


def verify_google_id_token(id_token: str) -> dict:
    """Validate a Google ID token and return its claims, or raise GoogleAuthError."""
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError("Google login is not configured")

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.GOOGLE_CLIENT_ID,
        )
    except Exception as e:  # PyJWTError, key-fetch failures, etc.
        raise GoogleAuthError(f"Invalid Google token: {e}")

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise GoogleAuthError("Invalid token issuer")
    if not claims.get("email"):
        raise GoogleAuthError("Token has no email")
    if claims.get("email_verified") is False:
        raise GoogleAuthError("Google email is not verified")

    return claims
