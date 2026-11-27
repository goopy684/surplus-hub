from typing import Generator
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core import security
from app.core.activity import record_activity
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.user import User

security_scheme = HTTPBearer()


def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_searcher_key(request: Request) -> str:
    """수요 집계용 검색자 식별자: 유효한 액세스 토큰이면 계정, 아니면 IP. 인가에는 쓰지 않는다.

    통신사 CGNAT·사무실 NAT는 여러 사람이 IP 하나를 쓰므로 로그인 사용자는 계정으로 구분한다.
    """
    auth = request.headers.get("Authorization", "")
    if auth[:7].lower() == "bearer ":
        try:
            payload = jwt.decode(auth[7:], settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            if payload.get("type") != "refresh" and payload.get("sub"):
                return f"u:{payload['sub']}"
        except jwt.PyJWTError:
            pass
    return f"ip:{get_client_ip(request)}"


def get_current_user(
    db: Session = Depends(get_db),
    token: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> User:
    """Resolve the current user from the app's own JWT (HS256).

    Native email/password auth: tokens are issued by /auth/login and
    /auth/register and signed with settings.SECRET_KEY.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except jwt.PyJWTError:
        raise credentials_error

    # Refresh tokens must not be accepted as access tokens.
    if payload.get("type") == "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token cannot be used for authentication",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_error

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    record_activity(db, user.id)
    return user

def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def get_current_active_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=400, detail="The user doesn't have enough privileges"
        )
    return current_user


def get_current_admin_user(min_role: str = "MODERATOR"):
    """Factory function that returns a dependency checking admin role."""
    from app.core.permissions import ROLE_HIERARCHY

    def _dep(current_user: User = Depends(get_current_active_user)) -> User:
        # Superusers have full admin access regardless of admin_role.
        if current_user.is_superuser:
            return current_user
        user_level = ROLE_HIERARCHY.get(current_user.admin_role or "", 0)
        required_level = ROLE_HIERARCHY.get(min_role, 0)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient admin privileges",
            )
        return current_user

    return _dep
