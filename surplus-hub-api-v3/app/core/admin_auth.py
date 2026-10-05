from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from starlette.responses import RedirectResponse

from app.core.config import settings
from app.core.security import verify_password
from app.db.session import SessionLocal
from app.models.user import User


class AdminAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        email = form.get("username", "")
        password = form.get("password", "")

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == email).first()
            if not user or not user.hashed_password:
                return False
            if not verify_password(password, user.hashed_password):
                return False
            if not user.is_superuser or not user.is_active:
                return False

            request.session.update({"admin_user_id": str(user.id)})
            return True
        finally:
            db.close()

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool:
        admin_user_id = request.session.get("admin_user_id")
        if not admin_user_id:
            return False
        # Re-check each request so revoking superuser or banning ends an open session.
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == int(admin_user_id)).first()
            return bool(user and user.is_superuser and user.is_active)
        finally:
            db.close()


admin_auth = AdminAuth(secret_key=settings.SECRET_KEY)
