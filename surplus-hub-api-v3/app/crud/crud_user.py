from typing import Any, Dict, Optional, Union

from sqlalchemy.orm import Session

from app.core.security import get_password_hash, verify_password
from app.crud.base import CRUDBase
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def get_by_clerk_id(self, db: Session, *, clerk_id: str) -> Optional[User]:
        return db.query(User).filter(User.clerk_id == clerk_id).first()

    def create(self, db: Session, *, obj_in: UserCreate) -> User:
        db_obj = User(
            email=obj_in.email,
            hashed_password=get_password_hash(obj_in.password),
            name=obj_in.name,
            is_active=True,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self, db: Session, *, db_obj: User, obj_in: Union[UserUpdate, Dict[str, Any]]
    ) -> User:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        if "password" in update_data and update_data["password"]:
            hashed_password = get_password_hash(update_data["password"])
            del update_data["password"]
            update_data["hashed_password"] = hashed_password
        return super().update(db, db_obj=db_obj, obj_in=update_data)

    def authenticate(self, db: Session, *, email: str, password: str) -> Optional[User]:
        user = self.get_by_email(db, email=email)
        if not user:
            return None
        if not user.hashed_password:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    def is_active(self, user: User) -> bool:
        return user.is_active

    def is_superuser(self, user: User) -> bool:
        return user.is_superuser

    def get_user_stats(self, db: Session, *, user_id: int) -> Dict[str, int]:
        """Get user statistics from actual DB aggregation."""
        from app.models.review import Review
        from app.models.transaction import Transaction
        from app.models.like import MaterialLike
        from app.models.community import Post

        # 매물 SOLD 수로 세면 매물이 판매중으로 남는 일부 수량 판매가 빠진다 (SH-39)
        sales_count = db.query(Transaction).filter(
            Transaction.seller_id == user_id,
            Transaction.status == "COMPLETED"
        ).count()

        purchase_count = db.query(Transaction).filter(
            Transaction.buyer_id == user_id,
            Transaction.status == "COMPLETED"
        ).count()

        review_count = db.query(Review).filter(
            Review.target_user_id == user_id
        ).count()

        wishlist_count = db.query(MaterialLike).filter(
            MaterialLike.user_id == user_id
        ).count()

        community_posts_count = db.query(Post).filter(
            Post.author_id == user_id
        ).count()

        return {
            "salesCount": sales_count,
            "purchaseCount": purchase_count,
            "reviewCount": review_count,
            "wishlistCount": wishlist_count,
            "communityPostsCount": community_posts_count,
        }


crud_user = CRUDUser(User)
