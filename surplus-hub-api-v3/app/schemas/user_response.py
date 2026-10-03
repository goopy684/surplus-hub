from typing import Optional
from pydantic import BaseModel
from app.schemas.response import StandardResponse

class UserStats(BaseModel):
    salesCount: int
    purchaseCount: int
    reviewCount: int
    wishlistCount: int = 0
    communityPostsCount: int = 0

class UserData(BaseModel):
    id: str
    email: Optional[str] = None
    name: str
    profileImageUrl: Optional[str]
    location: Optional[str]
    trustLevel: int
    mannerTemperature: float
    stats: UserStats
    isPremium: bool
    role: str = "user"
    # Admin gating for the native-auth frontend (replaces Clerk publicMetadata).
    adminRole: Optional[str] = None
    isSuperuser: bool = False

class UserResponse(StandardResponse):
    data: UserData
