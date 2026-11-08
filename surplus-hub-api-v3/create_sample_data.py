
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.user import User
from app.models.material import Material, TradeMethod, MaterialStatus
from app.models.material_image import MaterialImage
from app.models.community import Post, Comment
from app.models.chat import ChatRoom, Message
from app.core.security import get_password_hash
import random
from datetime import datetime, timedelta

def create_sample_data():
    db = SessionLocal()
    try:
        print("Cleaning up existing data (optional)...")
        # db.query(Message).delete()
        # db.query(ChatRoom).delete()
        # db.query(Comment).delete()
        # db.query(Post).delete()
        # db.query(MaterialImage).delete()
        # db.query(Material).delete()
        # db.commit()

        print("Creating users...")
        users = []
        for i in range(1, 6):
            email = f"user{i}@example.com"
            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(
                    email=email,
                    hashed_password=get_password_hash("password123"),
                    name=f"사용자{i}",
                    role="user",
                    is_active=True,
                    profile_image_url=f"https://api.dicebear.com/7.x/avataaars/svg?seed=user{i}",
                    trust_level=random.randint(1, 5),
                    manner_temperature=36.5 + random.uniform(-1.0, 5.0)
                )
                db.add(user)
                db.commit()
                db.refresh(user)
            users.append(user)
        
        print(f"Created/Found {len(users)} users.")

        print("Creating materials...")
        material_data = [
            # category는 업종별 6종(조명/문/창호/건축자재/전기/설비/기타) 중 하나여야 홈 칩 필터에 잡힌다
            ("남은 벽지 팝니다", "인테리어 후 남은 실크 벽지 2롤입니다. 상태 좋아요.", "건축자재", 30000, "https://images.unsplash.com/photo-1615873968403-89e068629265?auto=format&fit=crop&q=80&w=400"),
            ("목재 자투리 나눔해요", "DIY하다 남은 각목들입니다. 가져가실 분?", "건축자재", 0, "https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?auto=format&fit=crop&q=80&w=400"),
            ("타일 박스 채로 팝니다", "화장실 공사하고 남은 타일 3박스입니다.", "건축자재", 50000, "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&q=80&w=400"),
            ("페인트 4L 미개봉", "색상을 잘못 사서 팝니다. 벤자민무어 화이트.", "건축자재", 45000, "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&q=80&w=400"),
            ("철근 13mm 남은 것", "공사 현장에서 남은 철근입니다. 1톤 트럭 필요해요.", "건축자재", 100000, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Rebar_on_a_pallet.jpg/500px-Rebar_on_a_pallet.jpg"),
            ("단열재 아이소핑크", "두께 50mm, 10장 남았습니다.", "건축자재", 8000, "https://images.unsplash.com/photo-1600607686527-6fb886090705?auto=format&fit=crop&q=80&w=400"),
            ("LED 조명기구", "새 제품인데 사이즈가 안 맞아서 팝니다.", "조명", 25000, "https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?auto=format&fit=crop&q=80&w=400"),
            ("시멘트 1포대", "미장하다 남았습니다. 빨리 가져가세요.", "기타", 5000, "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Portland_Cement_Bags.jpg/500px-Portland_Cement_Bags.jpg"),
            ("창호 샷시", "이중창 샷시 철거한 것 드립니다.", "문/창호", 0, "https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&q=80&w=400"),
            ("데크용 방부목", "야외 데크 깔고 남은 자재입니다.", "건축자재", 60000, "https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&q=80&w=400")
        ]

        materials = []
        for idx, (title, description, category, price, img_url) in enumerate(material_data):
            seller = random.choice(users)
            material = Material(
                title=title,
                description=description,
                price=price,
                quantity=random.randint(1, 10),
                quantity_unit="개",
                trade_method="DIRECT", # TradeMethod.DIRECT.value if needed
                location_address=f"서울 강남구 역삼동 {random.randint(100, 999)}번지",
                location_lat=37.49 + random.uniform(-0.01, 0.01),
                location_lng=127.03 + random.uniform(-0.01, 0.01),
                category=category,
                status="ACTIVE",
                likes_count=random.randint(0, 20),
                seller_id=seller.id,
            )
            
            db.add(material)
            db.commit()
            db.refresh(material)
            
            # 메인 이미지
            image = MaterialImage(
                material_id=material.id,
                url=img_url,
                display_order=0
            )
            db.add(image)
            
            # 추가 이미지 (랜덤)
            for img_idx in range(1, random.randint(2, 4)):
                colors = ["red", "green", "blue", "yellow", "purple"]
                color = random.choice(colors)
                extra_image = MaterialImage(
                    material_id=material.id,
                    url=f"https://via.placeholder.com/400x300/{color}/ffffff?text=Image+{img_idx}",
                    display_order=img_idx
                )
                db.add(extra_image)
                
            materials.append(material)
        db.commit()
        print(f"Created {len(materials)} materials.")

        print("Creating community posts...")
        post_contents = [
            ("셀프 인테리어 질문입니다.", "화장실 줄눈 시공 셀프로 하려는데 팁 좀 주세요.", "QnA", "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&q=80&w=400"),
            ("타일 시공 업체 추천", "서울 강동구 지역 잘하는 업체 있을까요?", "Info", None),
            ("오늘 현장 사진", "날씨가 좋아서 작업하기 좋네요.", "KnowHow", "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&q=80&w=400"),
            ("남은 자재 처리 방법", "폐기물 어떻게 처리하시나요?", "QnA", None),
            ("목공 배우고 싶습니다", "주말에 배울 수 있는 공방 추천 부탁드려요.", "Info", None)
        ]

        posts = []
        for idx, (title, content, category, img_url) in enumerate(post_contents):
            author = random.choice(users)
            post = Post(
                title=title,
                content=content,
                category=category,
                author_id=author.id,
                views=random.randint(0, 50),
                likes_count=random.randint(0, 10),
                image_url=img_url
            )
            db.add(post)
            db.commit()
            db.refresh(post)
            
            # 댓글 추가
            for _ in range(random.randint(0, 3)):
                commenter = random.choice(users)
                comment = Comment(
                    post_id=post.id,
                    author_id=commenter.id,
                    content=f"좋은 정보 감사합니다! {random.randint(1, 100)}"
                )
                db.add(comment)
            posts.append(post)
        db.commit()
        print(f"Created {len(posts)} posts.")

        print("Creating chat rooms and messages...")
        # 사용자 1과 사용자 2의 채팅 (자재 1번에 대해)
        material_for_chat = materials[0]
        # materials[0]의 판매자 찾기 (seller_relationship 등을 통해 로딩되어 있지 않을 수 있으므로 쿼리)
        real_seller = db.query(User).filter(User.id == material_for_chat.seller_id).first()
        
        # 본인 물건에 채팅 못하므로 다른 유저 선택
        potential_buyers = [u for u in users if u.id != real_seller.id]
        real_buyer = random.choice(potential_buyers)

        # 기존 채팅방 확인
        existing_chat = db.query(ChatRoom).filter(
            ChatRoom.material_id == material_for_chat.id,
            ChatRoom.buyer_id == real_buyer.id
        ).first()

        if not existing_chat:
            chat_room = ChatRoom(
                material_id=material_for_chat.id,
                buyer_id=real_buyer.id,
                seller_id=real_seller.id
            )
            db.add(chat_room)
            db.commit()
            db.refresh(chat_room)
        else:
            chat_room = existing_chat
        
        # 메시지 생성
        messages_data = [
            (real_buyer, "안녕하세요, 이 자재 아직 있나요?"),
            (real_seller, "네, 아직 판매 중입니다."),
            (real_buyer, "네고 가능한가요?"),
            (real_seller, "얼마 생각하시나요?"),
            (real_buyer, "25,000원에 가능할까요?")
        ]
        
        for sender, text in messages_data:
            msg = Message(
                chat_room_id=chat_room.id,
                sender_id=sender.id,
                content=text,
                message_type="TEXT",
                is_read=False
            )
            db.add(msg)
        
        db.commit()
        print("Created chat rooms and messages.")

    except Exception as e:
        print(f"Error creating sample data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_sample_data()
