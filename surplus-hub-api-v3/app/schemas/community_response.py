from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.response import StandardResponse
from app.schemas.stored_url import StoredUrl

class PostBase(BaseModel):
    title: str
    content: str
    category: str
    image_url: Optional[str] = Field(None, alias="imageUrl")

class PostCreate(PostBase):
    image_url: Optional[StoredUrl] = Field(None, alias="imageUrl")

    model_config = {"populate_by_name": True}

class Post(PostBase):
    id: int
    author_id: int = Field(..., alias="authorId")
    author_name: str = Field(..., alias="authorName")
    views: int
    likes_count: int = Field(..., alias="likesCount")
    created_at: datetime = Field(..., alias="createdAt")

    model_config = {"populate_by_name": True, "from_attributes": True}

class PostListResponse(StandardResponse):
    data: List[Post]

class CommentCreate(BaseModel):
    content: str

class CommentResponse(BaseModel):
    id: int
    post_id: int = Field(..., alias="postId")
    author_id: int = Field(..., alias="authorId")
    author_name: str = Field(..., alias="authorName")
    content: str
    created_at: Optional[datetime] = Field(None, alias="createdAt")

    model_config = {"populate_by_name": True, "from_attributes": True}
