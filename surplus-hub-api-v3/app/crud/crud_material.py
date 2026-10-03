from typing import Any, Dict, List, Optional, Union

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload, selectinload

from app.crud.base import CRUDBase
from app.models.like import MaterialLike
from app.models.material import Material
from app.models.material_image import MaterialImage
from app.schemas.material import MaterialCreate, MaterialUpdate


class CRUDMaterial(CRUDBase[Material, MaterialCreate, MaterialUpdate]):
    def get_multi_with_filters(
        self,
        db: Session,
        *,
        page: int = 1,
        limit: int = 20,
        category: Optional[str] = None,
        keyword: Optional[str] = None,
        sort: Optional[str] = None,
        status: str = "ACTIVE",
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        radius: Optional[float] = None,
        price_min: Optional[int] = None,
        price_max: Optional[int] = None,
        trade_method: Optional[str] = None,
        condition_grade: Optional[str] = None,
        location_address: Optional[str] = None,
    ) -> tuple[List[Material], int]:
        query = db.query(Material).options(
            joinedload(Material.seller),
            selectinload(Material.material_images),
        ).filter(Material.status == status)

        if category and category != "전체":
            query = query.filter(Material.category == category)

        if keyword:
            search = f"%{keyword}%"
            query = query.filter(
                (Material.title.ilike(search)) | (Material.description.ilike(search))
            )

        if price_min is not None:
            query = query.filter(Material.price >= price_min)

        if price_max is not None:
            query = query.filter(Material.price <= price_max)

        if trade_method:
            query = query.filter(Material.trade_method == trade_method)

        if condition_grade:
            query = query.filter(Material.condition_grade == condition_grade)

        if location_address:
            query = query.filter(Material.location_address.ilike(f"%{location_address}%"))

        # Distance filtering using Haversine formula
        if lat is not None and lng is not None and radius is not None:
            # Haversine distance in km
            from sqlalchemy import func as sa_func, cast, Float
            import math

            # Bounding Box pre-filter (coarse, fast index-friendly filter)
            lat_diff = radius / 111.0  # 1 degree latitude ≈ 111km
            lng_diff = radius / (111.0 * max(math.cos(math.radians(lat)), 1e-10))
            query = query.filter(
                Material.location_lat.isnot(None),
                Material.location_lng.isnot(None),
                Material.location_lat.between(lat - lat_diff, lat + lat_diff),
                Material.location_lng.between(lng - lng_diff, lng + lng_diff),
            )

            # Haversine SQL expression (precise filter)
            distance_expr = (
                6371 * sa_func.acos(
                    sa_func.least(
                        1.0,
                        sa_func.cos(sa_func.radians(Material.location_lat))
                        * sa_func.cos(sa_func.radians(cast(lat, Float)))
                        * sa_func.cos(
                            sa_func.radians(Material.location_lng)
                            - sa_func.radians(cast(lng, Float))
                        )
                        + sa_func.sin(sa_func.radians(Material.location_lat))
                        * sa_func.sin(sa_func.radians(cast(lat, Float)))
                    )
                )
            )

            query = query.filter(distance_expr <= radius)

            if sort == "distance":
                query = query.order_by(distance_expr)

        # Sorting
        if sort == "price_asc":
            query = query.order_by(Material.price)
        elif sort == "price_desc":
            query = query.order_by(desc(Material.price))
        elif sort == "popular":
            query = query.order_by(desc(Material.likes_count))
        elif sort != "distance":  # distance sort handled above
            query = query.order_by(desc(Material.created_at))

        total_count = query.count()
        skip = (page - 1) * limit
        materials = query.offset(skip).limit(limit).all()

        return materials, total_count

    def create_with_images(
        self,
        db: Session,
        *,
        obj_in: MaterialCreate,
        seller_id: int,
        image_urls: Optional[List[str]] = None,
    ) -> Material:
        db_obj = Material(
            title=obj_in.title,
            description=obj_in.description,
            price=obj_in.price,
            quantity=obj_in.quantity,
            quantity_unit=obj_in.quantity_unit,
            trade_method=obj_in.trade_method,
            location_address=obj_in.location.address,
            location_lat=obj_in.location.lat,
            location_lng=obj_in.location.lng,
            category=obj_in.category,
            condition_grade=obj_in.condition_grade,
            status=obj_in.status or "ACTIVE",
            seller_id=seller_id,
        )
        db.add(db_obj)
        db.flush()

        # Add images
        urls = image_urls or obj_in.photo_urls or []
        for idx, url in enumerate(urls):
            img = MaterialImage(
                material_id=db_obj.id,
                url=url,
                display_order=idx,
            )
            db.add(img)

        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_material(
        self,
        db: Session,
        *,
        db_obj: Material,
        obj_in: Union[MaterialUpdate, Dict[str, Any]],
    ) -> Material:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        # Handle nested location
        if "location" in update_data and isinstance(update_data["location"], dict):
            loc = update_data.pop("location")
            if "address" in loc:
                update_data["location_address"] = loc["address"]
            if "lat" in loc:
                update_data["location_lat"] = loc["lat"]
            if "lng" in loc:
                update_data["location_lng"] = loc["lng"]

        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)

        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def soft_delete(self, db: Session, *, db_obj: Material) -> Material:
        db_obj.status = "HIDDEN"
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_status(
        self, db: Session, *, db_obj: Material, status: str
    ) -> Material:
        db_obj.status = status
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)

        # Let users who liked this material know it got reserved or sold.
        # Lives here so every caller (status endpoint, transaction completion) notifies.
        if status in ("RESERVED", "SOLD"):
            from app.core.notify import notify_many  # 지연 import: app.core.notify -> app.crud 순환 회피

            liker_ids = [
                uid for (uid,) in db.query(MaterialLike.user_id).filter(
                    MaterialLike.material_id == db_obj.id,
                    MaterialLike.user_id != db_obj.seller_id,
                ).all()
            ]
            if liker_ids:
                label = "예약 중" if status == "RESERVED" else "판매 완료"
                notify_many(
                    db,
                    user_ids=liker_ids,
                    type="MATERIAL_STATUS",
                    title="관심 자재 상태가 변경되었어요",
                    body=f"'{db_obj.title}' 자재가 {label}(으)로 변경되었습니다.",
                    reference_type="material",
                    reference_id=db_obj.id,
                )
        return db_obj

    def get_multi_cursor(
        self,
        db: Session,
        *,
        cursor: Optional[int] = None,
        limit: int = 20,
        category: Optional[str] = None,
        keyword: Optional[str] = None,
        sort: Optional[str] = None,
        status: str = "ACTIVE",
    ) -> tuple[List[Material], Optional[int]]:
        """Cursor-based pagination using ID as stable cursor.
        Sorts by ID descending (newest first). For custom sorting,
        use offset-based pagination instead.
        Returns (items, next_cursor_id).
        """
        query = db.query(Material).options(
            joinedload(Material.seller),
            selectinload(Material.material_images),
        ).filter(Material.status == status)

        if category and category != "전체":
            query = query.filter(Material.category == category)
        if keyword:
            search = f"%{keyword}%"
            query = query.filter(
                (Material.title.ilike(search)) | (Material.description.ilike(search))
            )
        if cursor:
            query = query.filter(Material.id < cursor)

        # Cursor pagination always uses ID-based ordering for stability
        query = query.order_by(desc(Material.id))

        items = query.limit(limit + 1).all()

        next_cursor = None
        if len(items) > limit:
            items = items[:limit]
            next_cursor = items[-1].id

        return items, next_cursor

    def get_by_seller(
        self, db: Session, *, seller_id: int, skip: int = 0, limit: int = 100
    ) -> List[Material]:
        return (
            db.query(Material)
            .filter(Material.seller_id == seller_id)
            .offset(skip)
            .limit(limit)
            .all()
        )


crud_material = CRUDMaterial(Material)
