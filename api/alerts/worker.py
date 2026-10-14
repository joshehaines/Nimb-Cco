"""Alert delivery worker.

Runs after each ingestion load (or every few minutes under compose): for every enabled rule,
find the alerts since the rule last ran that the rule matches and that have not been delivered
for this rule, group them by recipient and channel, respect frequency, quiet hours and digest
times, send, and record every delivery in alert_deliveries. alert_rule_sent is the dedupe ledger,
so a crash between send and record can at worst repeat a message, never lose one.

    python -m alerts.worker --once         evaluate and send now
    python -m alerts.worker --loop 300     every five minutes
    python -m alerts.worker --dry-run      evaluate, write deliveries as "simulated", send nothing
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from .matcher import Context, match_rule
from .senders import send_email, send_sms, send_teams
from .templates import render_email, render_sms, render_teams

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://cpi:cpi@localhost:5432/cpi")


@dataclass
class Prefs:
    email: str = ""
    email_verified: bool = False
    mobile: str = ""
    mobile_verified: bool = False
    teams_webhook: str = ""
    quiet_from: str = "21:00"
    quiet_to: str = "07:00"
    quiet_enabled: bool = True
    digest_hour: int = 8
    weekly_day: int = 1


def in_quiet_hours(p: Prefs, now: datetime) -> bool:
    if not p.quiet_enabled:
        return False
    fh, fm = map(int, p.quiet_from.split(":"))
    th, tm = map(int, p.quiet_to.split(":"))
    mins, f, t = now.hour * 60 + now.minute, fh * 60 + fm, th * 60 + tm
    return (f <= mins < t) if f <= t else (mins >= f or mins < t)


def digest_due(frequency: str, p: Prefs, last_fired: datetime | None, now: datetime) -> bool:
    """Is it time for this rule's digest? Instant always; hourly when an hour has passed; daily and
    weekly once we are past the digest hour (and day) and have not sent since the previous slot."""
    if frequency == "instant":
        return True
    if frequency == "hourly":
        return last_fired is None or now - last_fired >= timedelta(hours=1)
    slot = now.replace(hour=p.digest_hour, minute=0, second=0, microsecond=0)
    if frequency == "weekly":
        slot -= timedelta(days=(slot.weekday() + 1 - p.weekly_day) % 7)  # weekly_day: 0 = Sunday
    if slot > now:
        slot -= timedelta(days=7 if frequency == "weekly" else 1)
    return last_fired is None or last_fired < slot


def plan_sends(rule: dict[str, Any], alerts: list[dict[str, Any]], owner: dict[str, Any], prefs: Prefs, staff: dict[str, dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    """Decide what goes to whom. Returns [{channel, to, to_name, alerts, status, note}] with
    status 'suppressed' for channels the person has not set up, 'deferred' for quiet hours."""
    out: list[dict[str, Any]] = []
    critical = [a for a in alerts if a.get("severity") == "critical"]
    batch = alerts if digest_due(rule.get("frequency", "daily"), prefs, rule.get("last_fired_at"), now) else (critical if rule.get("instantForCritical", True) else [])
    if not batch:
        return out
    quiet = in_quiet_hours(prefs, now) and rule.get("frequency") == "instant"

    def add(channel: str, to: str, to_name: str, ok: bool, why: str | None):
        if not ok:
            out.append({"channel": channel, "to": "", "to_name": to_name, "alerts": batch, "status": "suppressed", "note": why})
        elif quiet and channel in ("email", "sms") and not (rule.get("instantForCritical", True) and critical):
            out.append({"channel": channel, "to": to, "to_name": to_name, "alerts": batch, "status": "deferred", "note": "quiet hours"})
        else:
            out.append({"channel": channel, "to": to, "to_name": to_name, "alerts": batch, "status": "pending", "note": None})

    for ch in rule.get("channels", ["inapp"]):
        if ch == "inapp":
            add(ch, "in app", owner["name"], True, None)
        elif ch == "email":
            add(ch, prefs.email, owner["name"], bool(prefs.email and prefs.email_verified), "email not verified" if prefs.email else "no email address")
        elif ch == "sms":
            add(ch, prefs.mobile, owner["name"], bool(prefs.mobile and prefs.mobile_verified), "mobile not verified" if prefs.mobile else "no mobile number")
        elif ch == "teams":
            add(ch, prefs.teams_webhook, owner["name"], bool(prefs.teams_webhook), "no Teams webhook")
    for r in rule.get("recipients", []):
        s = staff.get(r.get("staffId"))
        if not s:
            continue
        for ch in r.get("channels", []):
            if ch == "inapp":
                add(ch, "in app", s["name"], True, None)
            elif ch == "email":
                add(ch, s.get("email", ""), s["name"], bool(s.get("email")), "no email in directory")
            elif ch == "sms":
                add(ch, s.get("mobile", ""), s["name"], bool(s.get("mobile")), "no mobile in directory")
    return out


def dispatch(rule: dict[str, Any], send: dict[str, Any], *, dry_run: bool = False) -> tuple[str, str | None, str, str]:
    """Send one planned message. Returns (status, note, subject, body)."""
    alerts = send["alerts"]
    if send["channel"] == "email":
        subject, body = render_email(rule, alerts, send["to_name"])
    elif send["channel"] == "sms":
        subject, body = "SMS", render_sms(rule, alerts)
    elif send["channel"] == "teams":
        subject, body = "Teams card", json.dumps(render_teams(rule, alerts))
    else:
        subject, body = (alerts[0]["title"] if len(alerts) == 1 else f"{rule['name']}: {len(alerts)} events"), "\n".join(f"{a['title']} — {a.get('detail', '')}" for a in alerts)
    if send["status"] != "pending":
        return send["status"], send["note"], subject, body
    if dry_run:
        return "simulated", "dry run", subject, body
    if send["channel"] == "email":
        st, note = send_email(send["to"], subject, body)
    elif send["channel"] == "sms":
        st, note = send_sms(send["to"], body)
    elif send["channel"] == "teams":
        st, note = send_teams(send["to"], render_teams(rule, alerts))
    else:
        st, note = "sent", None
    return st, note, subject, body


async def run_once(pool, *, dry_run: bool = False, now: datetime | None = None) -> int:
    """Evaluate every enabled rule and deliver. Returns messages written."""
    now = now or datetime.now(timezone.utc)
    written = 0
    async with pool.acquire() as c:
        rules = await c.fetch("select r.*, u.email as owner_email, coalesce(u.name, u.email, r.user_id) as owner_name from alert_rules r left join users u on u.user_id = r.user_id where r.enabled")
        staff_rows = await c.fetch("select * from staff")
        staff = {s["id"]: dict(s) for s in staff_rows}
        for r in rules:
            rule = json.loads(r["body"]) if isinstance(r["body"], str) else dict(r["body"])
            rule.update({"id": r["rule_id"], "name": r["name"], "enabled": r["enabled"], "last_fired_at": r["last_fired_at"]})
            pr = await c.fetchrow("select * from notification_prefs where user_id = $1", r["user_id"])
            prefs = Prefs(**{k: pr[k] for k in Prefs.__dataclass_fields__ if pr is not None and k in pr.keys()}) if pr else Prefs(email=r["owner_email"] or "")
            since = r["last_fired_at"] or (now - timedelta(days=30))
            alerts = await c.fetch(
                "select a.*, b.distress_flags, b.tenure as business_tenure, t.tenure as title_tenure from alerts a left join businesses b on b.business_id = a.business_id left join titles t on t.title_number = a.title_number "
                "where a.occurred_at > $1 and not exists (select 1 from alert_rule_sent s where s.rule_id = $2 and s.alert_id = a.alert_id) order by a.occurred_at",
                since, r["rule_id"],
            )
            watch = await c.fetch("select entity_type, entity_id, extra, st_x(centre) as lon, st_y(centre) as lat from watch_items_with_centre where user_id = $1", r["user_id"])
            watchlist = [{"entityType": w["entity_type"], "entityId": w["entity_id"], **(json.loads(w["extra"]) if isinstance(w["extra"], str) else (w["extra"] or {}))} for w in watch]
            centres = {w["entity_id"]: (w["lon"], w["lat"]) for w in watch if w["lon"] is not None}
            hits = []
            for a in alerts:
                al = {"alertId": a["alert_id"], "kind": a["kind"], "title": a["title"], "detail": a["detail"], "occurredAt": a["occurred_at"].isoformat(), "severity": a["severity"], "entityType": a["entity_type"], "entityId": a["entity_id"], "sector": a["sector"],
                      "businessId": a["business_id"], "titleNumber": a["title_number"], "postcode": a["postcode"], "location": [a["lon"], a["lat"]] if a["lon"] is not None else None}
                ctx = Context(business={"distressFlags": list(a["distress_flags"] or []), "tenure": a["business_tenure"]}, title={"tenure": a["title_tenure"], "proprietors": []}, deal_score=a["deal_score"], watchlist=watchlist, site_centres=centres)
                if match_rule(rule, al, ctx).match:
                    hits.append(al)
            if not hits:
                continue
            owner = {"name": r["owner_name"], "email": r["owner_email"]}
            sends = plan_sends(rule, hits, owner, prefs, staff, now)
            if not sends:
                continue
            delivered_ids: set[str] = set()
            for s in sends:
                st, note, subject, body = dispatch(rule, s, dry_run=dry_run)
                await c.execute(
                    "insert into alert_deliveries (rule_id, user_id, channel, to_addr, to_name, alert_ids, subject, body, status, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
                    r["rule_id"], r["user_id"], s["channel"], s["to"], s["to_name"], [a["alertId"] for a in s["alerts"]], subject, body, st, note,
                )
                written += 1
                if st in ("sent", "simulated"):
                    delivered_ids.update(a["alertId"] for a in s["alerts"])
            for aid in delivered_ids:
                await c.execute("insert into alert_rule_sent (rule_id, alert_id, sent_at) values ($1,$2,$3) on conflict do nothing", r["rule_id"], aid, now)
            if delivered_ids:
                await c.execute("update alert_rules set last_fired_at = $2, fired_count = fired_count + $3 where rule_id = $1", r["rule_id"], now, len(delivered_ids))
    return written


async def main() -> None:
    import asyncpg

    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", type=int, default=0, help="seconds between runs")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=2)
    try:
        while True:
            n = await run_once(pool, dry_run=args.dry_run)
            print(f"alerts worker: {n} message(s) written")
            if not args.loop:
                break
            time.sleep(args.loop)
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
