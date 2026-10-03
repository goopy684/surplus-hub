import logging
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from sqladmin import Admin
from starlette.middleware.sessions import SessionMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.admin_auth import admin_auth
from app.core.rate_limit import limiter
from app.core.exceptions import AppException, app_exception_handler, generic_exception_handler
from app.core.logging_config import setup_logging
from app.api.api import api_router
from app.api.endpoints import ws
from app.db.database import database
from app.db.session import engine
from app.admin_views import UserAdmin, MaterialAdmin, ChatRoomAdmin, PostAdmin

# Ensure static directory exists
os.makedirs("static/uploads", exist_ok=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for Surplus Hub - Construction Material Marketplace",
    version="3.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Request Logging Middleware
_access_logger = logging.getLogger("surplushub.access")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    _access_logger.info(
        f"{request.method} {request.url.path} {response.status_code} {duration:.3f}s"
    )
    return response


# Session Middleware (must be before CORS)
app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)

# CORS Middleware Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate Limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Global exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Admin Interface (with authentication)
admin = Admin(app, engine, authentication_backend=admin_auth, title="잉여자재 관리자")
admin.add_view(UserAdmin)
admin.add_view(MaterialAdmin)
admin.add_view(ChatRoomAdmin)
admin.add_view(PostAdmin)

# Setup structured logging
setup_logging()

logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await database.connect()

    logger.info("AI provider: %s", settings.AI_PROVIDER)

    # Warm up embedding provider to avoid cold-start latency on first request
    try:
        from app.ai.clients.embeddings import _get_model
        _get_model()
        if settings.use_vertex:
            logger.info("Vertex AI embedding provider initialized")
        elif settings.use_local_embedding:
            logger.info("Local embedding model warm-up complete")
        else:
            logger.info("OpenAI embedding provider initialized (APP_ENV=%s)", settings.APP_ENV)
    except Exception:
        logger.warning("Embedding provider warm-up failed (will retry on first use)", exc_info=True)

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()

# WebSocket routes (no /api/v1 prefix)
app.include_router(ws.router, prefix="/ws", tags=["websocket"])

# REST API routes
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Health"])
def root():
    return {
        "status": "ok",
        "message": "Welcome to Surplus Hub API",
        "version": "3.0.0",
        "docs": "/docs",
        "admin": "/admin",
    }


@app.get("/health", tags=["Health"])
def health_check():
    """Detailed health check endpoint."""
    checks = {"api": "ok"}
    
    # DB check
    try:
        from sqlalchemy import text
        from app.db.session import SessionLocal
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    
    all_ok = all(v == "ok" for v in checks.values())
    
    return {
        "status": "ok" if all_ok else "degraded",
        "checks": checks,
    }
