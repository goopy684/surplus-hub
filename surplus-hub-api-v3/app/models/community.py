from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id"))
    
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String, index=True) # QnA, KnowHow, Safety, Info
    
    views = Column(Integer, default=0)
    likes_count = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    author = relationship("User", backref="posts")

    # Simple image handling for posts (single or multiple, usually handled by a separate table or array, keeping simple for now)
    image_url = Column(String, nullable=True)

    def __str__(self) -> str:
        return f"{self.title} (#{self.id})"

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"))
    author_id = Column(Integer, ForeignKey("users.id"))
    
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    post = relationship("Post", backref="comments")
    author = relationship("User")

    def __str__(self) -> str:
        body = (self.content or "")[:40]
        return f"Comment #{self.id}: {body}"
