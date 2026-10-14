"""Message templates shared by every channel. Plain text for email and SMS, an Adaptive Card for Teams."""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any

APP_URL = os.environ.get("APP_URL", "https://property-intelligence.internal/").rstrip("/") + "/"
SEV_ICON = {"info": "•", "warning": "▲", "critical": "‼"}


def link_for(a: dict[str, Any]) -> str:
    if a.get("entityType") == "company":
        return f"{APP_URL}companies/{a['entityId']}"
    return f"{APP_URL}map/{a['entityType']}/{a['entityId']}"


def when(iso: str) -> str:
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return d.strftime("%-d %b %H:%M")
    except Exception:  # noqa: BLE001
        return iso


def render_email(rule: dict[str, Any], alerts: list[dict[str, Any]], recipient_name: str) -> tuple[str, str]:
    crit = sum(1 for a in alerts if a.get("severity") == "critical")
    if len(alerts) == 1:
        subject = f"[Property Intelligence] {alerts[0]['title']}"
    else:
        subject = f"[Property Intelligence] {rule['name']}: {len(alerts)} events" + (f" ({crit} critical)" if crit else "")
    first = (recipient_name or "there").split(" ")[0]
    lines = [f"Hello {first},", ""]
    lines.append(f'Your alert "{rule["name"]}" matched one event:' if len(alerts) == 1 else f'Your alert "{rule["name"]}" matched {len(alerts)} events' + (f", {crit} of them critical" if crit else "") + ":")
    lines.append("")
    for a in sorted(alerts, key=lambda x: 0 if x.get("severity") == "critical" else 1):
        meta = " · ".join(x for x in [a.get("kind"), a.get("sector"), a.get("postcode")] if x)
        lines += [f"{SEV_ICON.get(a.get('severity', 'info'), '•')} {a['title']}", f"   {a.get('detail', '')}", f"   {meta} · {when(a['occurredAt'])}", f"   {link_for(a)}", ""]
    tag = f" ({rule['tag']})" if rule.get("tag") else ""
    lines += ["—", f'Sent by Property Intelligence because of your alert "{rule["name"]}"{tag}. Manage alerts: {APP_URL}alerts/rules',
              "Internal use only. Ownership data is used under HM Land Registry licence terms; do not forward outside Christie & Co."]
    return subject, "\n".join(lines)


def render_sms(rule: dict[str, Any], alerts: list[dict[str, Any]]) -> str:
    label = rule.get("tag") or rule["name"]
    head = f"PI alert ({label}): " if len(alerts) == 1 else f"PI {label}: {len(alerts)} events. "
    items = [("!! " if a.get("severity") == "critical" else "") + a["title"] + (f" ({a['postcode']})" if a.get("postcode") else "") for a in alerts[:3]]
    text = head + "; ".join(items) + (f" +{len(alerts) - 3} more" if len(alerts) > 3 else "") + f" {APP_URL}alerts"
    return text if len(text) <= 300 else text[:297] + "…"


def render_teams(rule: dict[str, Any], alerts: list[dict[str, Any]]) -> dict[str, Any]:
    body: list[dict[str, Any]] = [{"type": "TextBlock", "size": "Medium", "weight": "Bolder", "text": alerts[0]["title"] if len(alerts) == 1 else f"{rule['name']}: {len(alerts)} events"}]
    for a in alerts[:8]:
        body.append({"type": "TextBlock", "wrap": True, "text": f"**{'‼ ' if a.get('severity') == 'critical' else ''}{a['title']}** — {a.get('detail', '')} _({a.get('kind')}, {when(a['occurredAt'])})_"})
    actions = [{"type": "Action.OpenUrl", "title": a["title"][:40], "url": link_for(a)} for a in alerts[:3]]
    return {"type": "message", "attachments": [{"contentType": "application/vnd.microsoft.card.adaptive", "content": {"type": "AdaptiveCard", "version": "1.4", "body": body, "actions": actions}}]}


def teams_json(rule: dict[str, Any], alerts: list[dict[str, Any]]) -> str:
    return json.dumps(render_teams(rule, alerts), indent=2)
