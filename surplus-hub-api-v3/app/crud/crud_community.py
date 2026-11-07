from typing import Dict, List, Optional, Union

from sqlalchemy import desc, update
from sqlalchemy.orm import Session, joinedload

from app.crud.base import CRUDBase
from app.models.community import Post, Comment
from app.schemas.community_response import PostCreate

_CATEGORY_CANONICAL = {
    "QnA": "QnA",
    "질문/답변": "QnA",
    "KnowHow": "노하우",
    "노하우": "노하우",
    "Safety": "안전",
    "안전": "안전",
    "Info": "정보",
    "정보": "정보",
}

_CATEGORY_ALIASES = {
    "QnA": ["QnA", "질문/답변"],
    "질문/답변": ["QnA", "질문/답변"],
    "KnowHow": ["노하우", "KnowHow"],
    "노하우": ["노하우", "KnowHow"],
    "Safety": ["안전", "Safety"],
    "안전": ["안전", "Safety"],
    "Info": ["정보", "Info"],
    "정보": ["정보", "Info"],
}


def normalize_post_category(category: Optional[str]) -> Optional[str]:
    if not category:
        return category
    return _CATEGORY_CANONICAL.get(category, category)


class CRUDPost(CRUDBase[Post, PostCreate, dict]):
    def get_multi_with_filters(
        self,
        db: Session,
        *,
        page: int = 1,
        limit: int = 20,
        category: Optional[str] = None,
        author_id: Optional[int] = None,
    ) -> tuple[List[Post], int]:
        query = db.query(Post).options(joinedload(Post.author))

        if category and category != "전체":
            aliases = _CATEGORY_ALIASES.get(category)
            if aliases:
                query = query.filter(Post.category.in_(aliases))
            else:
                query = query.filter(Post.category == category)

        if author_id is not None:
            query = query.filter(Post.author_id == author_id)

        query = query.order_by(desc(Post.created_at))

        total = query.count()
        skip = (page - 1) * limit
        posts = query.offset(skip).limit(limit).all()
        return posts, total

    def get_multi_cursor(
        self,
        db: Session,
        *,
        cursor: Optional[int] = None,
        limit: int = 20,
        category: Optional[str] = None,
    ) -> tuple[List[Post], Optional[int]]:
        """Cursor-based pagination. Returns (items, next_cursor)."""
        query = db.query(Post).options(joinedload(Post.author))
        if category and category != "전체":
            aliases = _CATEGORY_ALIASES.get(category)
            if aliases:
                query = query.filter(Post.category.in_(aliases))
            else:
                query = query.filter(Post.category == category)
        if cursor:
            query = query.filter(Post.id < cursor)

        query = query.order_by(desc(Post.id))
        items = query.limit(limit + 1).all()

        next_cursor = None
        if len(items) > limit:
            items = items[:limit]
            next_cursor = items[-1].id

        return items, next_cursor

    def create_post(
        self, db: Session, *, obj_in: PostCreate, author_id: int
    ) -> Post:
        db_obj = Post(
            title=obj_in.title,
            content=obj_in.content,
            category=normalize_post_category(obj_in.category),
            image_url=obj_in.image_url,
            author_id=author_id,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def increment_views(self, db: Session, *, db_obj: Post) -> Post:
        # Atomic increment at SQL level to prevent lost updates
        db.execute(
            update(Post)
            .where(Post.id == db_obj.id)
            .values(views=Post.views + 1)
        )
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_post(
        self, db: Session, *, db_obj: Post, obj_in: Union[Dict, PostCreate]
    ) -> Post:
        if isinstance(obj_in, dict):
            update_data = dict(obj_in)
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        if "category" in update_data:
            update_data["category"] = normalize_post_category(update_data["category"])
        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj


class CRUDComment(CRUDBase[Comment, dict, dict]):
    def get_by_post(
        self, db: Session, *, post_id: int, skip: int = 0, limit: int = 50
    ) -> tuple[List[Comment], int]:
        query = db.query(Comment).filter(
            Comment.post_id == post_id
        ).order_by(Comment.created_at)

        total = query.count()
        comments = query.offset(skip).limit(limit).all()
        return comments, total

    def create_comment(
        self, db: Session, *, post_id: int, author_id: int, content: str
    ) -> Comment:
        db_obj = Comment(
            post_id=post_id,
            author_id=author_id,
            content=content,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj


crud_post = CRUDPost(Post)
crud_comment = CRUDComment(Comment)
