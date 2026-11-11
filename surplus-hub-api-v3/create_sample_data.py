
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
            # category는 업종별 6종(조명/문창호/건축자재/전기/설비/기타) 중 하나여야 홈 칩 필터에 잡힌다
            ("현대제철 H형강 150x150 (SS275, 6m 무절단 신재급 잉여 8본)", "반월공단 공장 증축 현장에서 설계 변경으로 남은 현대제철 정품 H형강 8본입니다.", "건축자재", 1280000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/e90c3e9a3088.jpg"),
            ("KCC 석고보드 9.5T 방화/일반 혼합 1파레트 (미개봉 80장)", "성수동 오피스 인테리어 마감 후 남은 KCC 정품 석고보드 9.5T 80장입니다.", "건축자재", 240000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/f44de3a62a6c.jpg"),
            ("LS전선 F-CV 16sq 4C 전력케이블 미사용 잔량 85m (보빈 포함)", "온수산업단지 수변전실 간선 포설 공사 후 남은 LS전선 정품 F-CV 16SQ 4코어 정척 85m입니다.", "전기", 680000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/e9cd4071398c.jpg"),
            ("LS산전(LS ELECTRIC) 배선용 차단기 MCCB ABN203c 200A 3P 신품 6개", "분전반 제작용으로 발주했다가 사양 변경으로 미사용 보관 중인 LS ELECTRIC 정품 MCCB 차단기 6개입니다.", "전기", 330000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/400a3766b73d.jpg"),
            ("세아제강 STS304 스테인리스 배관 파이프 50A (SCH10S, 6m 15본)", "시화국가산단 유틸리티 배관 공사 완료 후 남은 세아제강 국산 STS304 파이프 50A 15본입니다.", "설비", 950000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/42a86bf9b444.jpg"),
            ("삼양 플랜지형 주강 볼밸브 65A (KS 10K, 미사용 재고 10조)", "기계설비 공사에서 여유분으로 발주했던 65A 주강 볼밸브(KS 10K 플랜지 타입) 미사용 10조입니다.", "설비", 450000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/5fab30b636af.jpg"),
            ("KCC 발코니/사무실용 하이샤시 이중창 세트 (1800x1500, 로이복층유리 포함)", "현장 실측 오차로 미설치 보관 중인 KCC 정품 PVC 하이샤시 이중창 2세트입니다.", "문/창호", 520000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/77ec474f2063.jpg"),
            ("60분 갑종 방화문 세트 900x2100 (문틀·도어클로저·모티스락 포함 4조)", "공장동 비상구 개보수 공사에서 잉여 발생한 KFI 인정 60분 갑종 방화문 4조입니다.", "문/창호", 640000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/a12c896d0ce7.jpg"),
            ("필립스 산업용 고천장 LED 하이베이 투광등 150W (주광색 5700K, 미개봉 12개)", "공장 및 물류창고 천장에 최적화된 LED 하이베이 등기구 150W 미개봉 12개입니다.", "조명", 780000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/f9a8c283e550.jpg"),
            ("오스람 LED 엣지 평판등 1280x320 50W 무플리커 5박스 (25개 일괄)", "오피스 현장 납품 후 남은 LED 엣지 평판등(1280x320, 50W) 미개봉 5박스입니다.", "조명", 350000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/f62b40c56c0c.jpg"),
            ("보쉬(BOSCH) 전문가용 18V 브러쉬리스 로터리 함마드릴 GBH 18V-26 풀세트", "현장 준공 후 장비 정리 차원에서 내놓는 보쉬 GBH 18V-26 충전 함마드릴 세트입니다.", "기타", 320000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/5d29cdfea0ab.jpg"),
            ("유로폼·시스템비계 아연도금 클램프(고정/자동 혼합) 300개 마대포장", "가설공사 해체 후 선별·세척 완료한 단관비계용 아연도금 클램프 300개 마대포장입니다.", "기타", 270000, "https://pub-965df44b60ed4d5bbeceeb71d7092e9e.r2.dev/materials/2026/11/11/6797c7b98d56.jpg"),
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
            
            # R2 현장 이미지
            image = MaterialImage(
                material_id=material.id,
                url=img_url,
                display_order=0
            )
            db.add(image)

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
