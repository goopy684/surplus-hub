from sqladmin import ModelView
from app.models.user import User
from app.models.material import Material
from app.models.chat import ChatRoom, Message
from app.models.community import Post, Comment


class UserAdmin(ModelView, model=User):
    name = "사용자"
    name_plural = "사용자"
    icon = "fa-solid fa-user"
    column_list = [User.id, User.email, User.name, User.role, User.trust_level]
    column_searchable_list = [User.name, User.email]
    column_labels = {
        "id": "ID",
        "email": "이메일",
        "name": "이름",
        "role": "역할",
        "admin_role": "관리자 권한",
        "is_superuser": "슈퍼관리자",
        "is_active": "활성",
        "trust_level": "신뢰등급",
        "manner_temperature": "매너온도",
        "profile_image_url": "프로필 이미지",
        "location": "지역",
        "clerk_id": "Clerk ID",
        "hashed_password": "비밀번호(해시)",
        "created_at": "가입일",
        "updated_at": "수정일",
    }


class MaterialAdmin(ModelView, model=Material):
    name = "자재"
    name_plural = "자재"
    icon = "fa-solid fa-box"
    column_list = [Material.id, Material.title, Material.price, Material.status, Material.seller_id]
    column_searchable_list = [Material.title, Material.description]
    column_sortable_list = [Material.price, Material.created_at]
    # The pgvector VECTOR column has no sqladmin field converter, so it crashes
    # the detail view and the create/edit form (NoConverterFound). It is an AI
    # embedding with no business meaning in the admin, so exclude it from both.
    column_details_exclude_list = ["embedding_vector"]
    form_excluded_columns = ["embedding_vector"]
    column_labels = {
        "id": "ID",
        "title": "제목",
        "description": "설명",
        "price": "가격",
        "quantity": "수량",
        "quantity_unit": "단위",
        "trade_method": "거래방식",
        "location_address": "거래지역",
        "location_lat": "위도",
        "location_lng": "경도",
        "category": "카테고리",
        "condition_grade": "상태등급",
        "status": "상태",
        "likes_count": "찜 수",
        "seller_id": "판매자 ID",
        "seller": "판매자",
        "material_images": "이미지",
        "reviewer": "검수자",
        "reviewed_by": "검수자 ID",
        "review_note": "검수 메모",
        "reviewed_at": "검수일",
        "created_at": "등록일",
        "updated_at": "수정일",
    }


class ChatRoomAdmin(ModelView, model=ChatRoom):
    name = "채팅방"
    name_plural = "채팅방"
    icon = "fa-solid fa-comments"
    column_list = [ChatRoom.id, ChatRoom.material_id, ChatRoom.buyer_id, ChatRoom.seller_id]
    column_labels = {
        "id": "ID",
        "material_id": "자재 ID",
        "material": "자재",
        "buyer_id": "구매자 ID",
        "buyer": "구매자",
        "seller_id": "판매자 ID",
        "seller": "판매자",
        "created_at": "생성일",
    }


class PostAdmin(ModelView, model=Post):
    name = "게시글"
    name_plural = "게시글"
    icon = "fa-solid fa-newspaper"
    column_list = [Post.id, Post.title, Post.category, Post.author_id]
    column_labels = {
        "id": "ID",
        "title": "제목",
        "content": "내용",
        "category": "카테고리",
        "author_id": "작성자 ID",
        "author": "작성자",
        "views": "조회수",
        "likes_count": "좋아요",
        "image_url": "이미지",
        "created_at": "작성일",
        "comments": "댓글",
    }
