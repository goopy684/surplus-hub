from datetime import datetime, timedelta, timezone
from typing import List

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.event import Event
from app.schemas.event import EventResponse


class CRUDEvent(CRUDBase[Event, EventResponse, dict]):
    def get_active_events(
        self, db: Session, *, skip: int = 0, limit: int = 20
    ) -> tuple[List[Event], int]:
        query = db.query(Event).filter(
            Event.is_active == True,
        ).order_by(desc(Event.created_at))

        total = query.count()
        items = query.offset(skip).limit(limit).all()
        return items, total

    def seed_events(self, db: Session) -> List[Event]:
        """Seed default B2B promotions/events if none exist."""
        existing = db.query(Event).count()
        if existing > 0:
            items, _ = self.get_active_events(db)
            return items

        now = datetime.now(timezone.utc)
        start = now - timedelta(days=14)
        end = now + timedelta(days=90)

        default_events = [
            {
                "title": "온수·반월·시화산단 거점 철물점 'Surplus Zone' 위탁 수수료 0% 프로모션",
                "description": (
                    "산업단지 제휴 거점 철물점(Surplus Zone) 오픈 기념! "
                    "현장에서 남은 잉여자재를 촬영해 3초 AI 시세조회 후 거점 철물점에 위탁 등록하시면 "
                    "초기 3개월간 보관·위탁 수수료(10%) 전액 면제 및 당일 현금 정산 혜택을 드립니다."
                ),
                "image_url": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1000&q=80",
                "event_type": "promotion",
                "start_date": start,
                "end_date": end,
                "is_active": True,
            },
            {
                "title": "산단 중량 자재(H형강·배관·전력케이블) 직거래 화물 배차비 지원 이벤트",
                "description": (
                    "자투리(Surplus Hub)에서 100만 원 이상 철골·스테인리스 배관·전력케이블 보빈 직거래 성사 시, "
                    "1톤~5톤 화물차 배차 운임 5만 원을 즉시 지원해 드립니다. (산단 간 직거래 한정, 월 최대 3회)"
                ),
                "image_url": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80",
                "event_type": "promotion",
                "start_date": start,
                "end_date": end,
                "is_active": True,
            },
            {
                "title": "B2B 품질 안심 캠페인 — 밀시트(Mill Sheet)·KS 성적서 첨부 매물 상단 노출",
                "description": (
                    "자재 등록 시 강재 검사증명서(Mill Sheet), KS 인증서 또는 KFI 방화 시험성적서 사진을 함께 업로드하시면 "
                    "'품질보증 확인 매물' 우선 노출 혜택과 판매자 신뢰도 지수(+2.0°C) 가산점을 드립니다."
                ),
                "image_url": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1000&q=80",
                "event_type": "notice",
                "start_date": start,
                "end_date": end,
                "is_active": True,
            },
        ]

        events = []
        for data in default_events:
            ev = Event(**data)
            db.add(ev)
            events.append(ev)

        db.commit()
        for ev in events:
            db.refresh(ev)
        return events


crud_event = CRUDEvent(Event)
