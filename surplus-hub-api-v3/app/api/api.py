from fastapi import APIRouter

from app.api.endpoints import (
    auth, users, materials, chats, community, upload, categories,
    notifications, reviews, transactions, events, admin_api, ai_assist,
    admin_roles, reports, admin_users, admin_moderation, admin_dashboard,
    admin_notifications,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(chats.router, prefix="/chats", tags=["chats"])
api_router.include_router(community.router, prefix="/community", tags=["community"])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
api_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(admin_api.router, prefix="/admin", tags=["admin"])
api_router.include_router(admin_roles.router, prefix="/admin/roles", tags=["admin-roles"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(admin_users.router, prefix="/admin/users", tags=["admin-users"])
api_router.include_router(admin_moderation.router, prefix="/admin/moderation", tags=["admin-moderation"])
api_router.include_router(admin_dashboard.router, prefix="/admin/dashboard", tags=["admin-dashboard"])
api_router.include_router(admin_notifications.router, prefix="/admin/notifications", tags=["admin-notifications"])
api_router.include_router(ai_assist.router, prefix="/ai", tags=["ai"])
