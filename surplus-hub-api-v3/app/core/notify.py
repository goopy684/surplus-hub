"""
Single entry point for user notifications: creates the in-app row, then pushes
to the user's devices if their preferences allow it.

Callers should use this instead of touching crud_notification / send_push_notification
directly — it is the one place that knows about preferences and dead tokens.
Never raises: a failed notification must not break the request that triggered it.
"""
from typing import List, Optional
import logging

from sqlalchemy.orm import Session

from app.core.push import send_push_notification
from app.crud.crud_notification import crud_notification, crud_device_token
from app.models.notification import Notification
from app.models.user import User

logger = logging.getLogger(__name__)

# Notification type -> the User column that opts out of it.
# None = intentionally ungated (only push_enabled applies). A type that is NOT a key
# here is unknown and gets no push at all — see _push_allowed.
PUSH_PREF_BY_TYPE: dict[str, Optional[str]] = {
    "CHAT": "push_chat",
    "MATERIAL_STATUS": "push_material",
    "TRANSACTION": "push_material",
    "REVIEW": "push_community",
    "COMMENT": "push_community",
    "LIKE": "push_community",
    "MARKETING": "push_marketing",
    "SYSTEM": None,
}


def _push_allowed(user: Optional[User], type: str) -> bool:
    if user is None or not user.push_enabled:
        return False
    if type not in PUSH_PREF_BY_TYPE:
        # 매핑에 없는 타입(오타 포함)은 광고성일 수 있으므로 기본 차단한다.
        # 정보통신망법 옵트인 경계에서는 fail open이 아니라 fail closed여야 한다.
        logger.warning(f"unknown notification type {type!r}: push blocked (fail closed)")
        return False
    pref = PUSH_PREF_BY_TYPE[type]
    return True if pref is None else bool(getattr(user, pref, True))


def _ad_title(type: str, title: str) -> str:
    """정보통신망법 §50④: 광고성 정보는 제목에 (광고) 표기. 이미 있으면 중복하지 않는다."""
    if type == "MARKETING" and not title.lstrip().startswith("(광고)"):
        return f"(광고) {title}"
    return title


def _push_data(
    type: str, reference_type: Optional[str], reference_id: Optional[int], data: Optional[dict]
) -> dict:
    payload = {
        "type": type,
        "referenceType": reference_type,
        "referenceId": reference_id,
        **(data or {}),
    }
    # FCM/Expo data values must be strings
    return {k: str(v) for k, v in payload.items() if v is not None}


def _create_and_gate(
    db: Session,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str,
    reference_type: Optional[str],
    reference_id: Optional[int],
    push: bool,
) -> tuple[Optional[Notification], str, List[str]]:
    """
    Create the in-app row and decide whether a push may go out for this user.

    Returns (notification, outcome, tokens). outcome "ready" means `tokens` should
    be sent; otherwise it is a terminal outcome ("skipped" / "no_devices").
    Raises on DB failure — callers own the rollback.
    """
    user = db.query(User).filter(User.id == user_id).first()

    # 광고는 수신동의가 없으면 인앱 목록에도 남기지 않는다. 광고 노출 자체가 옵트인
    # 대상이고, created를 "발송됨"으로 읽는 관리자에게 거짓말이 되기 때문.
    # 다른 타입은 푸시만 막고 히스토리는 남긴다.
    if type == "MARKETING" and not (user is not None and user.push_marketing):
        return None, "skipped", []

    notification = crud_notification.create_notification(
        db,
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        reference_type=reference_type,
        reference_id=reference_id,
    )

    if not push or not _push_allowed(user, type):
        return notification, "skipped", []

    tokens = [t.token for t in crud_device_token.get_user_tokens(db, user_id=user_id)]
    if not tokens:
        return notification, "no_devices", []
    return notification, "ready", tokens


def _notify_one(
    db: Session,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str,
    reference_type: Optional[str],
    reference_id: Optional[int],
    data: Optional[dict],
    push: bool,
) -> tuple[Optional[Notification], str]:
    """
    Create the in-app notification and push it.

    Returns (notification, outcome) where outcome is one of:
    "pushed" (the transport accepted it for at least one device), "skipped"
    (prefs off / push=False / no transport configured / 미동의 광고),
    "no_devices" (nothing registered to push to), "failed".
    """
    try:
        title = _ad_title(type, title)
        notification, outcome, tokens = _create_and_gate(
            db,
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            reference_type=reference_type,
            reference_id=reference_id,
            push=push,
        )
        if outcome != "ready":
            return notification, outcome

        # 배지는 실제 미읽음 수. 푸시 1건당 쿼리 1번 추가 — 정확한 배지 값이 그만한
        # 가치가 있다고 판단. 병목이 되면 create_notification에서 함께 세는 게 다음 수.
        badge = crud_notification.get_unread_count(db, user_id=user_id)

        result = send_push_notification(
            tokens=tokens,
            title=title,
            body=body,
            data=_push_data(type, reference_type, reference_id, data),
            badges=dict.fromkeys(tokens, badge),
        )

        for token in result.get("invalid_tokens") or []:
            crud_device_token.deactivate_token(db, token=token, user_id=user_id)

        # No transport configured -> nothing actually left the server
        if result.get("skipped"):
            return notification, "skipped"

        # 부분 성공도 pushed: 최소 한 대에는 실제로 나갔다. 전부 실패면 failed.
        return notification, "pushed" if result.get("success", 0) > 0 else "failed"
    except Exception as e:
        # 실패한 알림이 호출자의 세션을 오염시키면(PendingRollbackError) 트리거한
        # 요청 전체가 죽는다. 여기서 반드시 되돌린다.
        db.rollback()
        logger.error(f"notify failed for user {user_id} ({type}): {e}", exc_info=True)
        return None, "failed"


def notify(
    db: Session,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    data: Optional[dict] = None,
    push: bool = True,
) -> Optional[Notification]:
    """
    Create the in-app notification and push it. Returns the row, or None on failure.

    The in-app row is created regardless of push preferences — only the push itself
    is gated, so notification history survives with push turned off. The one
    exception is MARKETING, which needs 수신동의 for the row too.
    """
    return _notify_one(
        db,
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        reference_type=reference_type,
        reference_id=reference_id,
        data=data,
        push=push,
    )[0]


def notify_many(
    db: Session,
    *,
    user_ids: List[int],
    type: str,
    title: str,
    body: str,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    data: Optional[dict] = None,
) -> dict:
    """
    Notify several users. Rows are created per user, but the push goes out as ONE
    batched send across every recipient's devices — a broadcast is a single HTTP
    round trip, not N serial ones at up to 10s each.

    `created` counts in-app rows (for MARKETING only opted-in users get one).
    `pushed` counts users the transport accepted at least one device for.
    `skipped` counts prefs-blocked users, users with no active device, and users
    nothing was sent for because no transport is configured.
    `failed` counts users whose row could not be created and users whose push did
    not leave the server. Every user lands in exactly one of pushed/skipped/failed.
    """
    title = _ad_title(type, title)
    stats = {"targeted": len(user_ids), "created": 0, "pushed": 0, "failed": 0, "skipped": 0}

    tokens_by_user: dict[int, List[str]] = {}
    badges: dict[str, int] = {}

    for user_id in user_ids:
        try:
            notification, outcome, tokens = _create_and_gate(
                db,
                user_id=user_id,
                type=type,
                title=title,
                body=body,
                reference_type=reference_type,
                reference_id=reference_id,
                push=True,
            )
        except Exception as e:
            # 한 사용자의 실패가 세션을 오염시켜 뒤따르는 정상 사용자까지
            # 실패로 몰지 않도록 즉시 되돌린다.
            db.rollback()
            logger.error(f"notify failed for user {user_id} ({type}): {e}", exc_info=True)
            stats["failed"] += 1
            continue

        if notification is not None:
            stats["created"] += 1
        if outcome != "ready":
            # "no_devices" is reported as skipped, never as pushed — a user with
            # no registered device was not reached, and these numbers are shown to admins.
            stats["skipped"] += 1
            continue

        tokens_by_user[user_id] = tokens
        badges.update(dict.fromkeys(tokens, crud_notification.get_unread_count(db, user_id=user_id)))

    if not tokens_by_user:
        return stats

    all_tokens = [t for tokens in tokens_by_user.values() for t in tokens]
    try:
        result = send_push_notification(
            tokens=all_tokens,
            title=title,
            body=body,
            data=_push_data(type, reference_type, reference_id, data),
            badges=badges,
        )
    except Exception as e:
        logger.error(f"batched push failed ({type}): {e}", exc_info=True)
        stats["failed"] += len(tokens_by_user)
        return stats

    # 죽은 토큰은 반드시 그 토큰의 소유자에 대해서만 비활성화한다.
    owner_by_token = {t: uid for uid, tokens in tokens_by_user.items() for t in tokens}
    for token in result.get("invalid_tokens") or []:
        owner = owner_by_token.get(token)
        if owner is not None:
            crud_device_token.deactivate_token(db, token=token, user_id=owner)

    # No transport configured -> nothing actually left the server
    if result.get("skipped"):
        stats["skipped"] += len(tokens_by_user)
        return stats

    failed_tokens = set(result.get("failed_tokens") or [])
    delivered = result.get("success", 0) > 0
    for tokens in tokens_by_user.values():
        if delivered and any(t not in failed_tokens for t in tokens):
            stats["pushed"] += 1
        else:
            stats["failed"] += 1

    return stats
