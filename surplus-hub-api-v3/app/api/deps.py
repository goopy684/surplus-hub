from typing import Generator
import jwt
from fastapi import Depends, HTTPException, status
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
