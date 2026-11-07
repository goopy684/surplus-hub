from typing import List, Optional

from sqlalchemy import case, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.like import MaterialLike, PostLike
from app.models.material import Material
from app.models.community import Post


class CRUDMaterialLike:
    def toggle(self, db: Session, *, user_id: int, material_id: int) -> bool:
        """Toggle like. Returns True if liked, False if unliked."""
        existing = db.query(MaterialLike).filter(
            MaterialLike.user_id == user_id,
            MaterialLike.material_id == material_id,
        ).first()

        if existing:
            db.delete(existing)
            # Atomic decrement at SQL level
            db.execute(
                update(Material)
                .where(Material.id == material_id)
                .values(likes_count=case(
                    (Material.likes_count > 0, Material.likes_count - 1),
                    else_=0
                ))
            )
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return self.is_liked(db, user_id=user_id, material_id=material_id)
            return False
        else:
            db_obj = MaterialLike(user_id=user_id, material_id=material_id)
            db.add(db_obj)
            # Atomic increment at SQL level
            db.execute(
                update(Material)
                .where(Material.id == material_id)
                .values(likes_count=Material.likes_count + 1)
            )
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return self.is_liked(db, user_id=user_id, material_id=material_id)
            return True

    def is_liked(self, db: Session, *, user_id: int, material_id: int) -> bool:
        return db.query(MaterialLike).filter(
            MaterialLike.user_id == user_id,
            MaterialLike.material_id == material_id,
        ).first() is not None

    def get_user_wishlist(
        self, db: Session, *, user_id: int, skip: int = 0, limit: int = 20
    ) -> tuple[List[Material], int]:
        query = db.query(Material).join(
            MaterialLike, Material.id == MaterialLike.material_id
        ).filter(
            MaterialLike.user_id == user_id,
            Material.status == "ACTIVE",
        ).order_by(MaterialLike.created_at.desc())

        total = query.count()
        items = query.offset(skip).limit(limit).all()
        return items, total


class CRUDPostLike:
    def toggle(self, db: Session, *, user_id: int, post_id: int) -> bool:
        """Toggle like. Returns True if liked, False if unliked."""
        existing = db.query(PostLike).filter(
            PostLike.user_id == user_id,
            PostLike.post_id == post_id,
        ).first()

        if existing:
            db.delete(existing)
            # Atomic decrement at SQL level
            db.execute(
                update(Post)
                .where(Post.id == post_id)
                .values(likes_count=case(
                    (Post.likes_count > 0, Post.likes_count - 1),
                    else_=0
                ))
            )
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return self.is_liked(db, user_id=user_id, post_id=post_id)
            return False
        else:
            db_obj = PostLike(user_id=user_id, post_id=post_id)
            db.add(db_obj)
            # Atomic increment at SQL level
            db.execute(
                update(Post)
                .where(Post.id == post_id)
                .values(likes_count=Post.likes_count + 1)
            )
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return self.is_liked(db, user_id=user_id, post_id=post_id)
            return True

    def is_liked(self, db: Session, *, user_id: int, post_id: int) -> bool:
        return db.query(PostLike).filter(
            PostLike.user_id == user_id,
            PostLike.post_id == post_id,
        ).first() is not None


crud_material_like = CRUDMaterialLike()
crud_post_like = CRUDPostLike()
