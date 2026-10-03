from datetime import timedelta
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api import deps
from app.core import security
from app.core.config import settings
from app.core.email import send_password_reset_email
from app.core.google_auth import GoogleAuthError, verify_google_id_token
from app.core.rate_limit import limiter
from app.crud.crud_user import crud_user
from app.models.user import User
from app.schemas.token import Token, RefreshTokenRequest
from app.schemas.user import UserCreate

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(..., alias="idToken")

    model_config = {"populate_by_name": True}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6, alias="newPassword")

    model_config = {"populate_by_name": True}


def _build_token_pair(user_id: int) -> dict:
    """Generate access + refresh token pair."""
    access_token = security.create_access_token(subject=user_id)
    refresh_token = security.create_refresh_token(subject=user_id)
    return {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "tokenType": "bearer",
    }


@router.post("/register", summary="Register")
@limiter.limit("10/minute")
def register(
    request: Request,
    body: RegisterRequest,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Email + password registration. No phone verification required."""
    existing = crud_user.get_by_email(db, email=body.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = crud_user.create(
        db, obj_in=UserCreate(email=body.email, password=body.password, name=body.name)
    )
    tokens = _build_token_pair(user.id)
    return {
        "status": "success",
        "data": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            **tokens,
        },
    }


@router.post("/login/access-token")
@limiter.limit("5/minute")
def login_access_token(
    request: Request,
    db: Session = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    user = crud_user.authenticate(db, email=form_data.username, password=form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    tokens = _build_token_pair(user.id)
    return {
        "status": "success",
        "data": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            **tokens,
        },
    }


@router.post("/google", summary="Login with Google")
@limiter.limit("10/minute")
def google_login(
    request: Request,
    body: GoogleAuthRequest,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Sign in with a Google ID token. Verifies the token, finds-or-creates the
    user by verified email, and issues the app's own JWT pair."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google 로그인이 구성되지 않았습니다.")

    try:
        claims = verify_google_id_token(body.id_token)
    except GoogleAuthError:
        raise HTTPException(status_code=401, detail="유효하지 않은 Google 토큰입니다.")

    email = claims["email"]
    user = crud_user.get_by_email(db, email=email)
    if not user:
        # Social account: no password. Linked to email/password accounts by email.
        user = User(
            email=email,
            name=claims.get("name") or email.split("@")[0],
            profile_image_url=claims.get("picture"),
            hashed_password=None,
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    tokens = _build_token_pair(user.id)
    return {
        "status": "success",
        "data": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            **tokens,
        },
    }


@router.post("/refresh-token", summary="Refresh Access Token")
@limiter.limit("10/minute")
def refresh_token(
    request: Request,
    body: RefreshTokenRequest,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Get a fresh access + refresh token pair using a valid refresh token.
    No Bearer header required — only the refresh token in the request body.
    """
    user_id = security.decode_refresh_token(body.refresh_token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = crud_user.get(db, id=int(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    tokens = _build_token_pair(user.id)
    return {
        "status": "success",
        "data": tokens,
    }


@router.post("/forgot-password", summary="Request Password Reset")
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Request a password reset link. Always returns success and does not reveal
    whether the email exists (to avoid account enumeration)."""
    resp: dict = {
        "status": "success",
        "data": {
            "message": "가입된 이메일이라면 비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해주세요.",
        },
    }
    user = crud_user.get_by_email(db, email=body.email)
    # Only act for existing accounts that have a password (not social-only).
    if user and user.hashed_password:
        token = security.create_password_reset_token(user.id, user.hashed_password)
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        # Send out-of-band so an SMTP round-trip cannot delay the response or
        # create a timing side-channel that reveals whether the account exists.
        background_tasks.add_task(send_password_reset_email, user.email, reset_url)
        # In local/dev there is no email provider, so expose the link for testing.
        if settings.APP_ENV.lower() in ("local", "test"):
            resp["data"]["devResetUrl"] = reset_url
    return resp


@router.post("/reset-password", summary="Reset Password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: Session = Depends(deps.get_db),
) -> Any:
    """Set a new password using a valid, single-use reset token."""
    invalid = HTTPException(status_code=400, detail="유효하지 않거나 만료된 링크입니다.")
    payload = security.decode_password_reset_token(body.token)
    if not payload or not payload.get("sub"):
        raise invalid

    user = crud_user.get(db, id=int(payload["sub"]))
    if not user or not user.hashed_password:
        raise invalid

    # Single-use: the token is bound to the password hash at issue time. If the
    # password already changed (token used / stale), the fingerprint won't match.
    if payload.get("pwf") != security.password_fingerprint(user.hashed_password):
        raise HTTPException(status_code=400, detail="이미 사용되었거나 만료된 링크입니다.")

    user.hashed_password = security.get_password_hash(body.new_password)
    db.add(user)
    db.commit()
    return {
        "status": "success",
        "data": {"message": "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요."},
    }
