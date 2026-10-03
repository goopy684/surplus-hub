from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.core.notify import notify
from app.crud.crud_community import crud_post, crud_comment
from app.crud.crud_like import crud_post_like
from app.models.user import User
from app.schemas.community_response import PostListResponse, PostCreate, Post as PostSchema, CommentCreate, CommentResponse

router = APIRouter()

def _post_to_schema(p, author_name: Optional[str] = None) -> PostSchema:
    return PostSchema(
        id=p.id,
        title=p.title,
        content=p.content,
        category=p.category,
        imageUrl=p.image_url,
        authorId=p.author_id,
        authorName=author_name or (p.author.name if p.author else "Unknown"),
        views=p.views,
        likesCount=p.likes_count,
        createdAt=p.created_at,
    )


@router.get("/posts", response_model=PostListResponse, summary="List Community Posts")
def read_posts(
    db: Session = Depends(deps.get_db),
    page: int = 1,
    limit: int = 20,
    category: Optional[str] = None,
    author_id: Optional[int] = None,
    cursor: Optional[int] = None,
) -> Any:
    # Cursor-based pagination
    if cursor is not None or page == 0:
        items, next_cursor = crud_post.get_multi_cursor(
            db, cursor=cursor, limit=limit, category=category
        )
        data = [_post_to_schema(p) for p in items]
        return {
            "status": "success",
            "data": data,
            "meta": {
                "nextCursor": next_cursor,
                "hasMore": next_cursor is not None,
                "limit": limit,
            },
        }

    # Offset-based pagination
    posts, total_count = crud_post.get_multi_with_filters(db, page=page, limit=limit, category=category, author_id=author_id)

    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 0
    has_next_page = page < total_pages

    data = [_post_to_schema(p) for p in posts]

    return {
        "status": "success",
        "data": data,
        "meta": {
            "totalCount": total_count,
            "page": page,
            "limit": limit,
            "hasNextPage": has_next_page,
            "totalPages": total_pages
        }
    }

@router.post("/posts", summary="Create Community Post")
def create_post(
    post_in: PostCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    db_obj = crud_post.create_post(db, obj_in=post_in, author_id=current_user.id)

    return {
        "status": "success",
        "data": PostSchema(
            id=db_obj.id,
            title=db_obj.title,
            content=db_obj.content,
            category=db_obj.category,
            imageUrl=db_obj.image_url,
            authorId=db_obj.author_id,
            authorName=current_user.name,
            views=db_obj.views,
            likesCount=db_obj.likes_count,
            createdAt=db_obj.created_at
        )
    }

@router.get("/posts/{id}", summary="Get Post Detail")
def read_post(
    id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    post = crud_post.get(db, id=id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    post = crud_post.increment_views(db, db_obj=post)

    return {
        "status": "success",
        "data": PostSchema(
            id=post.id,
            title=post.title,
            content=post.content,
            category=post.category,
            imageUrl=post.image_url,
            authorId=post.author_id,
            authorName=post.author.name if post.author else "Unknown",
            views=post.views,
            likesCount=post.likes_count,
            createdAt=post.created_at
        )
    }

@router.put("/posts/{id}", summary="Update Post")
def update_post(
    id: int,
    post_in: PostCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    post = crud_post.get(db, id=id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this post")

    updated = crud_post.update_post(db, db_obj=post, obj_in=post_in)

    return {
        "status": "success",
        "data": PostSchema(
            id=updated.id,
            title=updated.title,
            content=updated.content,
            category=updated.category,
            imageUrl=updated.image_url,
            authorId=updated.author_id,
            authorName=current_user.name,
            views=updated.views,
            likesCount=updated.likes_count,
            createdAt=updated.created_at
        )
    }

@router.delete("/posts/{id}", summary="Delete Post")
def delete_post(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    post = crud_post.get(db, id=id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this post")

    crud_post.remove(db, id=id)
    return {"status": "success", "data": {"message": "Post deleted"}}

@router.post("/posts/{id}/like", summary="Toggle Post Like")
def toggle_post_like(
    id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    post = crud_post.get(db, id=id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    is_liked = crud_post_like.toggle(db, user_id=current_user.id, post_id=id)
    db.refresh(post)
    return {
        "status": "success",
        "data": {"isLiked": is_liked, "likesCount": post.likes_count or 0},
    }

@router.get("/posts/{id}/comments", summary="List Comments")
def read_comments(
    id: int,
    db: Session = Depends(deps.get_db),
    page: int = 1,
    limit: int = 50,
) -> Any:
    post = crud_post.get(db, id=id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    skip = (page - 1) * limit
    comments, total = crud_comment.get_by_post(db, post_id=id, skip=skip, limit=limit)

    total_pages = (total + limit - 1) // limit if total > 0 else 0

    data = []
    for c in comments:
        data.append({
            "id": c.id,
            "postId": c.post_id,
            "authorId": c.author_id,
            "authorName": c.author.name if c.author else "Unknown",
            "content": c.content,
            "createdAt": c.created_at.isoformat() if c.created_at else None,
        })

    return {
        "status": "success",
        "data": data,
        "meta": {
            "totalCount": total,
            "page": page,
            "limit": limit,
            "hasNextPage": page < total_pages,
            "totalPages": total_pages
        }
    }

@router.post("/posts/{id}/comments", summary="Create Comment")
def create_comment(
    id: int,
    comment_in: CommentCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    post = crud_post.get(db, id=id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    comment = crud_comment.create_comment(db, post_id=id, author_id=current_user.id, content=comment_in.content)

    # Notify the post author, unless they are the one commenting
    if post.author_id != current_user.id:
        notify(
            db,
            user_id=post.author_id,
            type="COMMENT",
            title="새 댓글이 달렸어요",
            body=f"{current_user.name}님이 '{post.title}'에 댓글을 남겼습니다: {comment_in.content[:50]}",
            reference_type="post",
            reference_id=post.id,
        )

    return {
        "status": "success",
        "data": {
            "id": comment.id,
            "postId": comment.post_id,
            "authorId": comment.author_id,
            "authorName": current_user.name,
            "content": comment.content,
            "createdAt": comment.created_at.isoformat() if comment.created_at else None,
        }
    }

@router.put("/posts/{post_id}/comments/{comment_id}", summary="Update Comment")
def update_comment(
    post_id: int,
    comment_id: int,
    comment_in: CommentCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    comment = crud_comment.get(db, id=comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    comment.content = comment_in.content
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return {
        "status": "success",
        "data": {
            "id": comment.id,
            "postId": comment.post_id,
            "authorId": comment.author_id,
            "authorName": current_user.name,
            "content": comment.content,
            "createdAt": comment.created_at.isoformat() if comment.created_at else None,
        }
    }

@router.delete("/posts/{post_id}/comments/{comment_id}", summary="Delete Comment")
def delete_comment(
    post_id: int,
    comment_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    comment = crud_comment.get(db, id=comment_id)
    if not comment or comment.post_id != post_id:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    crud_comment.remove(db, id=comment_id)
    return {"status": "success", "data": {"message": "Comment deleted"}}
