"""Channel senders. Each returns (status, note). Configuration is by environment variable so the
same worker runs in the office with the firm's SMTP relay and Twilio account, or in a test with
the transports replaced.

  SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_STARTTLS (1)
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM  (or SMS_WEBHOOK_URL for another gateway)
  ALERTS_DRY_RUN=1 writes deliveries without sending anything.
"""
from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from typing import Any, Callable

import httpx

DRY_RUN = os.environ.get("ALERTS_DRY_RUN", "0") == "1"


def send_email(to: str, subject: str, body: str, *, transport: Callable[[EmailMessage], None] | None = None) -> tuple[str, str | None]:
    host = os.environ.get("SMTP_HOST")
    if DRY_RUN or (not host and transport is None):
        return ("simulated", "dry run" if DRY_RUN else "SMTP_HOST not set")
    msg = EmailMessage()
    msg["From"] = os.environ.get("SMTP_FROM", "alerts@property-intelligence.internal")
    msg["To"] = to
    msg["Subject"] = subject
    msg["X-Auto-Response-Suppress"] = "All"
    msg.set_content(body)
    try:
        if transport:
            transport(msg)
        else:
            with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=20) as s:
                if os.environ.get("SMTP_STARTTLS", "1") == "1":
                    s.starttls()
                if os.environ.get("SMTP_USER"):
                    s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
                s.send_message(msg)
        return ("sent", None)
    except Exception as e:  # noqa: BLE001
        return ("failed", str(e)[:200])


def send_sms(to: str, text: str, *, client: httpx.Client | None = None) -> tuple[str, str | None]:
    sid, token, frm = os.environ.get("TWILIO_ACCOUNT_SID"), os.environ.get("TWILIO_AUTH_TOKEN"), os.environ.get("TWILIO_FROM")
    gateway = os.environ.get("SMS_WEBHOOK_URL")
    if DRY_RUN or (not (sid and token and frm) and not gateway and client is None):
        return ("simulated", "dry run" if DRY_RUN else "no SMS provider configured")
    try:
        c = client or httpx.Client(timeout=20)
        if gateway and not sid:
            r = c.post(gateway, json={"to": to, "text": text})
        else:
            r = c.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data={"To": to, "From": frm, "Body": text}, auth=(sid or "", token or ""))
        if r.status_code >= 300:
            return ("failed", f"HTTP {r.status_code}: {r.text[:160]}")
        return ("sent", None)
    except Exception as e:  # noqa: BLE001
        return ("failed", str(e)[:200])


def send_teams(webhook: str, card: dict[str, Any], *, client: httpx.Client | None = None) -> tuple[str, str | None]:
    if DRY_RUN:
        return ("simulated", "dry run")
    if not webhook:
        return ("suppressed", "no Teams webhook")
    try:
        c = client or httpx.Client(timeout=20)
        r = c.post(webhook, json=card)
        if r.status_code >= 300:
            return ("failed", f"HTTP {r.status_code}: {r.text[:160]}")
        return ("sent", None)
    except Exception as e:  # noqa: BLE001
        return ("failed", str(e)[:200])
