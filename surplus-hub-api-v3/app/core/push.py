"""
Push notification service for Expo and Firebase Cloud Messaging.

Tokens are routed by shape: `ExponentPushToken[...]` / `ExpoPushToken[...]` go to
Expo's push service (no server credentials required), everything else is treated
as a raw FCM token and needs firebase-admin plus FIREBASE_CREDENTIALS_PATH.
Falls back to a no-op mode when neither transport is available.
"""
from typing import List, Optional
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_CHUNK_SIZE = 100  # Expo's documented max messages per request

# Lazy initialization of Firebase
_firebase_app = None


def _get_firebase_app():
    global _firebase_app
    if _firebase_app is not None:
        return _firebase_app

    try:
        import firebase_admin
        from firebase_admin import credentials

        cred_path = settings.FIREBASE_CREDENTIALS_PATH
        if not cred_path:
            logger.warning("FIREBASE_CREDENTIALS_PATH not set. Push notifications disabled.")
            return None

        cred = credentials.Certificate(cred_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase initialized successfully.")
        return _firebase_app
    except Exception as e:
        logger.warning(f"Failed to initialize Firebase: {e}. Push notifications disabled.")
        return None


def _is_expo_token(token: str) -> bool:
    return token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")


def _send_expo(
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
    badges: Optional[dict] = None,
) -> dict:
    """
    Send via Expo's push service. Chunks at EXPO_CHUNK_SIZE tokens per request.
    `badges` maps a token to the app badge count to show its owner.
    """
    headers = {"Content-Type": "application/json"}
    if settings.EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"

    sent: List[str] = []
    invalid_tokens: List[str] = []
    error: Optional[str] = None

    try:
        with httpx.Client(timeout=10.0) as client:
            for start in range(0, len(tokens), EXPO_CHUNK_SIZE):
                chunk = tokens[start:start + EXPO_CHUNK_SIZE]
                messages = [
                    {
                        "to": token,
                        "title": title,
                        "body": body,
                        "data": data or {},
                        "sound": "default",
                        "priority": "high",
                        "channelId": "default",
                        **({"badge": badges[token]} if badges and token in badges else {}),
                    }
                    for token in chunk
                ]

                response = client.post(EXPO_PUSH_URL, json=messages, headers=headers)
                response.raise_for_status()
                tickets = response.json().get("data") or []

                # zip stops at the shorter side: messages without a ticket never got
                # a verdict and stay out of `sent`, i.e. they count as failures.
                for token, ticket in zip(chunk, tickets):
                    if ticket.get("status") == "ok":
                        sent.append(token)
                        continue
                    err = (ticket.get("details") or {}).get("error")
                    if err == "DeviceNotRegistered":
                        invalid_tokens.append(token)
                    logger.warning(
                        f"Expo push failed for {token[:24]}...: {ticket.get('message')} ({err})"
                    )
    except Exception as e:
        logger.error(f"Expo push error: {e}")
        error = str(e)

    delivered = set(sent)
    failed_tokens = [t for t in tokens if t not in delivered]
    result = {
        "success": len(sent),
        "failure": len(failed_tokens),
        "invalid_tokens": invalid_tokens,
        "failed_tokens": failed_tokens,
    }
    if error is not None:
        result["error"] = error
    return result


def _send_fcm(
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
    badges: Optional[dict] = None,
) -> dict:
    """Send via Firebase Cloud Messaging."""
    app = _get_firebase_app()
    if app is None:
        logger.debug(f"FCM push skipped (Firebase not configured): {title}")
        return {
            "success": 0, "failure": 0,
            "invalid_tokens": [], "failed_tokens": [], "skipped": True,
        }

    # One multicast message carries one aps payload, so a badge can only be sent
    # when every token in this call wants the same number. Otherwise send none —
    # a wrong badge is worse than no badge.
    wanted = {badges[t] for t in tokens if badges and t in badges}
    badge = wanted.pop() if len(wanted) == 1 else None

    try:
        from firebase_admin import messaging

        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound="default",
                        badge=badge,
                    )
                )
            ),
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    sound="default",
                ),
            ),
        )

        response = messaging.send_each_for_multicast(message)

        # Log failed tokens and collect the ones FCM says are dead
        invalid_tokens: List[str] = []
        failed_tokens: List[str] = []
        if response.failure_count > 0:
            for i, send_response in enumerate(response.responses):
                if send_response.success:
                    continue
                failed_tokens.append(tokens[i])
                exc = getattr(send_response, "exception", None)
                if type(exc).__name__ in {"UnregisteredError", "SenderIdMismatchError"}:
                    invalid_tokens.append(tokens[i])
                logger.warning(
                    f"Failed to send to token {tokens[i][:20]}...: {exc}"
                )

        return {
            "success": response.success_count,
            "failure": response.failure_count,
            "invalid_tokens": invalid_tokens,
            "failed_tokens": failed_tokens,
        }
    except Exception as e:
        logger.error(f"Push notification error: {e}")
        return {
            "success": 0,
            "failure": len(tokens),
            "invalid_tokens": [],
            "failed_tokens": list(tokens),
            "error": str(e),
        }


def send_push_notification(
    tokens: List[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
    badges: Optional[dict] = None,
) -> dict:
    """
    Send push notification to multiple device tokens, routing each by shape.
    Returns dict with success/failure counts, the tokens the provider rejected as
    dead (`invalid_tokens`) and every token that did not get through
    (`failed_tokens`) so callers can tell which recipients were actually reached.
    """
    if not tokens:
        return {"success": 0, "failure": 0, "invalid_tokens": [], "failed_tokens": []}

    expo_tokens = [t for t in tokens if _is_expo_token(t)]
    fcm_tokens = [t for t in tokens if not _is_expo_token(t)]

    results = []
    if expo_tokens:
        results.append(_send_expo(expo_tokens, title, body, data, badges))
    if fcm_tokens:
        results.append(_send_fcm(fcm_tokens, title, body, data, badges))

    merged = {
        "success": sum(r["success"] for r in results),
        "failure": sum(r["failure"] for r in results),
        "invalid_tokens": [t for r in results for t in r["invalid_tokens"]],
        "failed_tokens": [t for r in results for t in r.get("failed_tokens") or []],
    }
    # Only report skipped when no transport did anything at all
    if all(r.get("skipped") for r in results):
        merged["skipped"] = True
    return merged
