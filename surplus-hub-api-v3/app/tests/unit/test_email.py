"""Unit tests for app.core.email.send_password_reset_email.

The SMTP transport is faked (monkeypatched over smtplib) so no network is
touched. settings are patched per-test and restored automatically by pytest's
monkeypatch fixture.
"""

import logging
import smtplib

import pytest

from app.core import email as email_module
from app.core.config import settings

RESET_URL = "https://app.example.com/reset-password?token=secret-token-abc123"
TO_EMAIL = "user@example.com"


class FakeSMTP:
    """Records SMTP interactions instead of opening a real connection."""

    instances: list = []

    def __init__(self, host=None, port=0, timeout=None, **kwargs):
        self.host = host
        self.port = port
        self.timeout = timeout
        self.starttls_called = False
        self.login_args = None
        self.sent_messages = []
        self.quit_called = False
        FakeSMTP.instances.append(self)

    def starttls(self, *args, **kwargs):
        self.starttls_called = True

    def login(self, user, password):
        self.login_args = (user, password)

    def send_message(self, msg):
        self.sent_messages.append(msg)

    def quit(self):
        self.quit_called = True


class FakeSMTPSSL(FakeSMTP):
    """Marker subclass so a test can distinguish SSL from STARTTLS construction."""


@pytest.fixture
def fake_smtp(monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTPSSL)
    return FakeSMTP


@pytest.fixture
def smtp_configured(monkeypatch):
    """Non-local environment with a full SMTP configuration."""
    monkeypatch.setattr(settings, "APP_ENV", "prod")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_PORT", 587)
    monkeypatch.setattr(settings, "SMTP_USER", "smtp-user")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "smtp-pass")
    monkeypatch.setattr(settings, "SMTP_TLS", True)
    monkeypatch.setattr(settings, "EMAILS_FROM_EMAIL", "no-reply@surplushub.kr")
    monkeypatch.setattr(settings, "EMAILS_FROM_NAME", "Surplus Hub")


def _plain_and_html(msg):
    plain = msg.get_body(preferencelist=("plain",)).get_content()
    html = msg.get_body(preferencelist=("html",)).get_content()
    return plain, html


# ---------------------------------------------------------------------------
# (a) local/test env never sends — even when SMTP is fully configured
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("env", ["local", "test", "LOCAL"])
def test_local_env_does_not_send(fake_smtp, monkeypatch, env):
    monkeypatch.setattr(settings, "APP_ENV", env)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "EMAILS_FROM_EMAIL", "no-reply@surplushub.kr")

    email_module.send_password_reset_email(TO_EMAIL, RESET_URL)

    assert fake_smtp.instances == []


# ---------------------------------------------------------------------------
# (b) non-local + configured => real send with correct envelope + STARTTLS/login
# ---------------------------------------------------------------------------
def test_sends_via_smtp_when_configured(fake_smtp, smtp_configured):
    email_module.send_password_reset_email(TO_EMAIL, RESET_URL)

    assert len(fake_smtp.instances) == 1
    smtp = fake_smtp.instances[0]
    # STARTTLS path (plain SMTP), not implicit-TLS SMTP_SSL.
    assert type(smtp) is FakeSMTP
    assert smtp.host == "smtp.example.com"
    assert smtp.port == 587
    assert smtp.starttls_called is True
    assert smtp.login_args == ("smtp-user", "smtp-pass")
    assert smtp.quit_called is True
    assert len(smtp.sent_messages) == 1

    msg = smtp.sent_messages[0]
    assert msg["To"] == TO_EMAIL
    assert "no-reply@surplushub.kr" in msg["From"]
    assert "Surplus Hub" in msg["From"]
    assert msg["Subject"] == "[Surplus Hub] 비밀번호 재설정 안내"

    plain, html = _plain_and_html(msg)
    assert RESET_URL in plain
    assert RESET_URL in html


def test_port_465_uses_implicit_ssl(fake_smtp, smtp_configured, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_PORT", 465)

    email_module.send_password_reset_email(TO_EMAIL, RESET_URL)

    smtp = fake_smtp.instances[0]
    assert type(smtp) is FakeSMTPSSL
    assert smtp.port == 465
    assert smtp.starttls_called is False  # implicit TLS, no STARTTLS upgrade
    assert smtp.login_args == ("smtp-user", "smtp-pass")
    assert len(smtp.sent_messages) == 1


def test_no_login_without_credentials(fake_smtp, smtp_configured, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_USER", None)
    monkeypatch.setattr(settings, "SMTP_PASSWORD", None)

    email_module.send_password_reset_email(TO_EMAIL, RESET_URL)

    smtp = fake_smtp.instances[0]
    assert smtp.login_args is None
    assert len(smtp.sent_messages) == 1


# ---------------------------------------------------------------------------
# (c) non-local + not configured => warning only, no send
# ---------------------------------------------------------------------------
def test_warns_when_not_configured(fake_smtp, monkeypatch, caplog):
    monkeypatch.setattr(settings, "APP_ENV", "prod")
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    monkeypatch.setattr(settings, "EMAILS_FROM_EMAIL", None)

    with caplog.at_level(logging.WARNING, logger="app.email"):
        email_module.send_password_reset_email(TO_EMAIL, RESET_URL)

    assert fake_smtp.instances == []
    assert "no email provider configured" in caplog.text


def test_warns_when_from_email_missing(fake_smtp, monkeypatch, caplog):
    """Host set but no From address is still treated as unconfigured."""
    monkeypatch.setattr(settings, "APP_ENV", "prod")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "EMAILS_FROM_EMAIL", None)

    with caplog.at_level(logging.WARNING, logger="app.email"):
        email_module.send_password_reset_email(TO_EMAIL, RESET_URL)

    assert fake_smtp.instances == []
    assert "no email provider configured" in caplog.text


# ---------------------------------------------------------------------------
# (d) delivery failure is swallowed (logged, never raised) and never leaks the URL
# ---------------------------------------------------------------------------
def test_send_failure_does_not_raise(smtp_configured, monkeypatch, caplog):
    class BoomSMTP(FakeSMTP):
        def send_message(self, msg):
            raise smtplib.SMTPException("boom")

    monkeypatch.setattr(smtplib, "SMTP", BoomSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", BoomSMTP)

    with caplog.at_level(logging.ERROR, logger="app.email"):
        # Must not raise.
        email_module.send_password_reset_email(TO_EMAIL, RESET_URL)

    assert "failed to send password-reset email" in caplog.text
    # The reset URL is a secret and must never appear in logs on the non-local path.
    assert RESET_URL not in caplog.text
