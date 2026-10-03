import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("app.email")

_SUBJECT = "[Surplus Hub] 비밀번호 재설정 안내"
# Keep the connection short: this runs inside a request BackgroundTask, so a
# hung SMTP server must not tie up a worker thread indefinitely.
_SMTP_TIMEOUT = 10


def _is_local() -> bool:
    return settings.APP_ENV.lower() in ("local", "test")


def _build_message(to_email: str, reset_url: str) -> EmailMessage:
    """Build the Korean password-reset email (plain text + HTML alternative)."""
    from_email = settings.EMAILS_FROM_EMAIL
    from_name = settings.EMAILS_FROM_NAME

    msg = EmailMessage()
    msg["Subject"] = _SUBJECT
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = to_email

    text_body = (
        "안녕하세요, Surplus Hub입니다.\n\n"
        "비밀번호 재설정을 요청하셨습니다. 아래 링크에서 새 비밀번호를 설정해주세요.\n"
        f"{reset_url}\n\n"
        "이 링크는 30분간 유효하며 한 번만 사용할 수 있습니다.\n"
        "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.\n\n"
        "감사합니다.\nSurplus Hub 드림"
    )
    msg.set_content(text_body)

    html_body = (
        "<html><body>"
        "<p>안녕하세요, <strong>Surplus Hub</strong>입니다.</p>"
        "<p>비밀번호 재설정을 요청하셨습니다. 아래 버튼을 눌러 새 비밀번호를 설정해주세요.</p>"
        f'<p><a href="{reset_url}">비밀번호 재설정하기</a></p>'
        "<p>버튼이 열리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.<br>"
        f"{reset_url}</p>"
        "<p>이 링크는 30분간 유효하며 한 번만 사용할 수 있습니다. "
        "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>"
        "<p>감사합니다.<br>Surplus Hub 드림</p>"
        "</body></html>"
    )
    msg.add_alternative(html_body, subtype="html")
    return msg


def _send_via_smtp(msg: EmailMessage) -> None:
    """Open an SMTP connection per the configured settings and deliver ``msg``."""
    host = settings.SMTP_HOST
    port = settings.SMTP_PORT

    if port == 465:
        # Implicit TLS from the first byte; no STARTTLS upgrade.
        smtp = smtplib.SMTP_SSL(host, port, timeout=_SMTP_TIMEOUT)
    else:
        smtp = smtplib.SMTP(host, port, timeout=_SMTP_TIMEOUT)
    try:
        if port != 465 and settings.SMTP_TLS:
            smtp.starttls()
        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)
    finally:
        try:
            smtp.quit()
        except Exception:
            pass


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """Send a password-reset email.

    In local/test (APP_ENV) the reset URL is logged so the flow is fully
    testable without an email service. In non-local environments the mail is
    delivered over SMTP when SMTP_HOST and EMAILS_FROM_EMAIL are configured;
    otherwise a warning is logged and nothing is sent. Keep this signature so
    callers (auth endpoints) do not change.

    Delivery failures are swallowed (logged, never raised): forgot-password must
    not return 500 or leak whether an account exists.
    """
    if _is_local():
        logger.info("[DEV][password-reset] to=%s reset_url=%s", to_email, reset_url)
        return

    if not settings.SMTP_HOST or not settings.EMAILS_FROM_EMAIL:
        logger.warning(
            "send_password_reset_email: no email provider configured (to=%s). "
            "Set SMTP_HOST and EMAILS_FROM_EMAIL to enable delivery.",
            to_email,
        )
        return

    try:
        msg = _build_message(to_email, reset_url)
        _send_via_smtp(msg)
        # Never log reset_url outside local/dev — it is a secret credential.
        logger.info("password-reset email sent (to=%s)", to_email)
    except Exception:
        logger.exception("failed to send password-reset email (to=%s)", to_email)
