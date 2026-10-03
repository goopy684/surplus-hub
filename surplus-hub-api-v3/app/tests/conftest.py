import pytest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.api.deps import get_db
from app.core.security import create_access_token, get_password_hash
from app.models.user import User

# ---------------------------------------------------------------------------
# SQLite in-memory test database (StaticPool = single shared connection)
# ---------------------------------------------------------------------------
SQLALCHEMY_DATABASE_URL = "sqlite://"

test_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# ---------------------------------------------------------------------------
# Import ALL models so Base.metadata knows every table
# ---------------------------------------------------------------------------
import app.models.user  # noqa: F401, E402
import app.models.material  # noqa: F401, E402
import app.models.material_image  # noqa: F401, E402
import app.models.category  # noqa: F401, E402
import app.models.chat  # noqa: F401, E402
import app.models.community  # noqa: F401, E402
import app.models.notification  # noqa: F401, E402
import app.models.like  # noqa: F401, E402
import app.models.review  # noqa: F401, E402
import app.models.event  # noqa: F401, E402
import app.models.transaction  # noqa: F401, E402
import app.models.subscription  # noqa: F401, E402
import app.models.admin  # noqa: F401, E402
import app.models.moderation  # noqa: F401, E402
import app.models.stats  # noqa: F401, E402


# ---------------------------------------------------------------------------
# No test may reach the real Expo push service. Replaces the httpx
# reference app.core.push looks its client up through, so tests that patch
# push.httpx.Client themselves still work.
#
# NetworkBlocked derives from BaseException on purpose: push.py and notify.py
# both swallow `except Exception`, so an Exception here would be silently
# absorbed and the test would pass while having tried to hit the network.
# ---------------------------------------------------------------------------
class NetworkBlocked(BaseException):
    pass


@pytest.fixture(scope="session", autouse=True)
def _block_push_transport():
    from types import SimpleNamespace
    from app.core import push as push_mod

    def _blocked(*args, **kwargs):
        raise NetworkBlocked(
            "test tried to reach the real push transport; "
            "patch app.core.notify.send_push_notification instead"
        )

    with patch.object(push_mod, "httpx", SimpleNamespace(Client=_blocked)):
        yield


# ---------------------------------------------------------------------------
# Session-scoped: create/drop all tables once
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


# ---------------------------------------------------------------------------
# DB dependency override
# ---------------------------------------------------------------------------
def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Session-scoped DB session (for seeding shared data)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def db():
    session = TestingSessionLocal()
    yield session
    session.close()


# ---------------------------------------------------------------------------
# Seed users (session-scoped, created once)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def test_user(db):
    user = User(
        email="testuser@example.com",
        hashed_password=get_password_hash("password123"),
        name="Test User",
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def test_user2(db):
    user = User(
        email="testuser2@example.com",
        hashed_password=get_password_hash("password123"),
        name="Test User 2",
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def test_superuser(db):
    user = User(
        email="admin@example.com",
        hashed_password=get_password_hash("adminpass"),
        name="Admin User",
        is_active=True,
        is_superuser=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def test_moderator(db):
    user = User(
        email="moderator@example.com",
        hashed_password=get_password_hash("modpass"),
        name="Moderator User",
        is_active=True,
        is_superuser=False,
        admin_role="MODERATOR",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture(scope="session")
def test_admin(db):
    user = User(
        email="adminrole@example.com",
        hashed_password=get_password_hash("adminpass2"),
        name="Admin Role User",
        is_active=True,
        is_superuser=False,
        admin_role="ADMIN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Auth header helpers
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def auth_headers(test_user):
    token = create_access_token(subject=test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def auth_headers2(test_user2):
    token = create_access_token(subject=test_user2.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def superuser_headers(test_superuser):
    token = create_access_token(subject=test_superuser.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def moderator_headers(test_moderator):
    token = create_access_token(subject=test_moderator.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_headers(test_admin):
    token = create_access_token(subject=test_admin.id)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# TestClient (session-scoped, mocks async DB, overrides get_db)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def client(test_user, test_user2, test_superuser):
    """TestClient with SQLite in-memory DB and mocked async database."""
    from app.main import app
    from app.db.database import database as async_database

    app.dependency_overrides[get_db] = _override_get_db

    with patch.object(async_database, "connect", new_callable=AsyncMock), \
         patch.object(async_database, "disconnect", new_callable=AsyncMock):
        with TestClient(app) as c:
            yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Reset slowapi rate limiter between tests (prevents 429 in full test suite)
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def reset_rate_limiter():
    from app.main import app
    if hasattr(app.state, "limiter"):
        try:
            app.state.limiter._storage.reset()
        except Exception:
            pass
    yield
