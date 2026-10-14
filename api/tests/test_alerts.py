"""Alert rules: matcher, templates, send planning and the worker against the fake pool."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from conftest import FakePool, Row

from alerts.matcher import Context, match_rule
from alerts.templates import render_email, render_sms, render_teams
from alerts.worker import Prefs, digest_due, in_quiet_hours, plan_sends, run_once

NOW = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)


def alert(**patch):
    base = {"alertId": "A1", "kind": "Gazette notice", "title": "Gazette notice: Arden Inns Ltd", "detail": "Notice of intention to appoint administrators.", "occurredAt": "2026-10-01T09:00:00Z", "severity": "critical",
            "entityType": "company", "entityId": "01234567", "sector": "Pub", "businessId": "B0001", "titleNumber": "WK1", "postcode": "CV32 4AB", "location": [-1.5365, 52.2888]}
    base.update(patch)
    return base


def rule(**patch):
    base = {"id": "R1", "name": "Dirty deals", "tag": "Dirty deals", "enabled": True, "conditions": {"kinds": [], "sectors": [], "severities": [], "distressOnly": False, "distressFlags": [], "ownerCategories": []},
            "scope": {"mode": "everywhere", "radiusM": 500, "siteIds": [], "postcodes": [], "offices": []}, "channels": ["inapp", "email"], "frequency": "instant", "instantForCritical": True, "recipients": []}
    base.update(patch)
    return base


def test_matcher_conditions_and_reasons():
    assert match_rule(rule(), alert(), Context()).match
    r = rule(conditions={"kinds": ["Lease event"], "sectors": [], "severities": [], "distressOnly": False, "distressFlags": [], "ownerCategories": []})
    m = match_rule(r, alert(), Context())
    assert not m.match and "kind Gazette notice not selected" in m.reasons[-1]
    r["conditions"].update(kinds=["Gazette notice"], sectors=["Hotel"])
    assert "sector Pub not selected" in match_rule(r, alert(), Context()).reasons[-1]
    r["conditions"].update(sectors=["Pub"], keywords="administrat", minDealScore=55)
    assert not match_rule(r, alert(), Context(deal_score=40)).match
    assert match_rule(r, alert(), Context(deal_score=60)).match


def test_matcher_scopes():
    wl = [{"entityType": "business", "entityId": "B0099", "stage": "Approach"}]
    r = rule(scope={"mode": "my-sites", "radiusM": 300, "siteIds": [], "postcodes": [], "offices": []})
    assert match_rule(r, alert(), Context(watchlist=wl, site_centres={"B0099": (-1.5365, 52.2888)})).match
    miss = match_rule(r, alert(), Context(watchlist=wl, site_centres={"B0099": (-1.5, 52.2888)}))
    assert not miss.match and "nearest watched site" in miss.reasons[-1]
    assert "on a watched site" in match_rule(r, alert(businessId="B0099"), Context(watchlist=wl)).reasons
    p = rule(scope={"mode": "postcodes", "radiusM": 0, "siteIds": [], "postcodes": ["cv32"], "offices": []})
    assert match_rule(p, alert(), Context()).match and not match_rule(p, alert(postcode="BS1 4DJ"), Context()).match
    o = rule(scope={"mode": "offices", "radiusM": 0, "siteIds": [], "postcodes": [], "offices": ["Bristol"]})
    assert match_rule(o, alert(postcode="BS1 4DJ"), Context()).match and not match_rule(o, alert(), Context()).match


def test_distress_only():
    r = rule(conditions={"kinds": [], "sectors": [], "severities": [], "distressOnly": True, "distressFlags": [], "ownerCategories": []})
    assert match_rule(r, alert(), Context()).match  # Gazette notice is itself a distress event
    assert not match_rule(r, alert(kind="EPC lodged", severity="info"), Context()).match
    assert match_rule(r, alert(kind="EPC lodged", severity="info"), Context(business={"distressFlags": ["Late accounts"]})).match


def test_templates():
    subject, body = render_email(rule(), [alert(), alert(alertId="A2", title="Second", severity="info")], "Priya Ahuja")
    assert "2 events (1 critical)" in subject and "Hello Priya" in body and "companies/01234567" in body
    sms = render_sms(rule(), [alert(alertId=f"A{i}", title=f"Event {i} with a long title") for i in range(6)])
    assert len(sms) <= 300 and "+3 more" in sms
    card = render_teams(rule(), [alert()])
    assert card["attachments"][0]["content"]["body"][0]["text"] == "Gazette notice: Arden Inns Ltd"


def test_quiet_hours_and_digest_due():
    p = Prefs(quiet_from="21:00", quiet_to="07:00", digest_hour=8, weekly_day=1)
    assert in_quiet_hours(p, NOW.replace(hour=23)) and not in_quiet_hours(p, NOW)
    assert digest_due("instant", p, None, NOW)
    assert digest_due("daily", p, NOW - timedelta(days=1), NOW)          # last ran yesterday, today's 08:00 slot passed
    assert not digest_due("daily", p, NOW - timedelta(hours=1), NOW)     # already ran after today's slot
    assert digest_due("hourly", p, NOW - timedelta(minutes=61), NOW) and not digest_due("hourly", p, NOW - timedelta(minutes=10), NOW)


def test_plan_sends_channels_recipients_and_suppression():
    staff = {"s1": {"id": "s1", "name": "Tom Barratt", "email": "t@x", "mobile": "+447700900105"}, "s2": {"id": "s2", "name": "No Mobile", "email": "n@x", "mobile": None}}
    r = rule(channels=["inapp", "email", "sms"], recipients=[{"staffId": "s1", "channels": ["sms"]}, {"staffId": "s2", "channels": ["sms"]}])
    prefs = Prefs(email="me@x", email_verified=True, mobile="+447700900001", mobile_verified=False, quiet_enabled=False)
    sends = plan_sends(r, [alert()], {"name": "Me", "email": "me@x"}, prefs, staff, NOW)
    by = {(s["channel"], s["to_name"]): s for s in sends}
    assert by[("email", "Me")]["status"] == "pending"
    assert by[("sms", "Me")]["status"] == "suppressed" and by[("sms", "Me")]["note"] == "mobile not verified"
    assert by[("sms", "Tom Barratt")]["status"] == "pending" and by[("sms", "Tom Barratt")]["to"] == "+447700900105"
    assert by[("sms", "No Mobile")]["status"] == "suppressed"


def test_plan_sends_quiet_hours_defer_non_critical_only():
    prefs = Prefs(email="me@x", email_verified=True, quiet_enabled=True, quiet_from="21:00", quiet_to="07:00")
    late = NOW.replace(hour=23)
    r = rule(channels=["email"], frequency="instant", instantForCritical=True)
    assert plan_sends(r, [alert(severity="warning")], {"name": "Me"}, prefs, {}, late)[0]["status"] == "deferred"
    assert plan_sends(r, [alert(severity="critical")], {"name": "Me"}, prefs, {}, late)[0]["status"] == "pending"


def test_worker_run_once_writes_deliveries_and_dedupes():
    rule_row = Row(rule_id="R1", user_id="u1", name="Dirty deals", enabled=True, body=json.dumps(rule(channels=["email"])), last_fired_at=None, fired_count=0, owner_email="me@x", owner_name="Me")
    prefs_row = Row(user_id="u1", email="me@x", email_verified=True, mobile="", mobile_verified=False, teams_webhook="", quiet_enabled=False, quiet_from="21:00", quiet_to="07:00", digest_hour=8, weekly_day=1)
    alert_row = Row(alert_id="A1", kind="Gazette notice", title="Gazette notice: Arden Inns Ltd", detail="Notice of intention to appoint administrators.", occurred_at=NOW - timedelta(days=1), severity="critical", entity_type="company", entity_id="01234567", sector="Pub",
                    business_id="B0001", title_number="WK1", postcode="CV32 4AB", lon=-1.5365, lat=52.2888, deal_score=61, distress_flags=["Administration"], business_tenure="Leasehold", title_tenure="Freehold")
    pool = FakePool([("from alert_rules r", [rule_row]), ("from staff", []), ("from notification_prefs", [prefs_row]), ("from alerts a", [alert_row]), ("from watch_items_with_centre", [])])
    n = asyncio.run(run_once(pool, dry_run=True, now=NOW))
    assert n == 1
    inserts = [c for c in pool.conn.calls if c[0].startswith("insert into alert_deliveries")]
    assert len(inserts) == 1 and inserts[0][1][2] == "email" and inserts[0][1][8] == "simulated" and "Gazette notice" in inserts[0][1][6]
    assert any(c[0].startswith("insert into alert_rule_sent") for c in pool.conn.calls)
    assert any(c[0].startswith("update alert_rules set last_fired_at") for c in pool.conn.calls)


def test_rules_api_round_trip(make_client):
    client, conn = make_client([("from alert_rules where user_id", [Row(rule_id="R1", user_id="demo-agent", name="Dirty deals", enabled=True, body=json.dumps(rule()), created_at=NOW, updated_at=NOW, last_fired_at=None, fired_count=3)]), ("select user_id from alert_rules", None)])
    r = client.get("/api/alerts/rules", headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 200 and r.json()[0]["id"] == "R1" and r.json()[0]["firedCount"] == 3 and r.json()[0]["conditions"]["kinds"] == []
    r = client.put("/api/alerts/rules/R2", json=rule(id="R2", name="Leases"), headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 200
    sql, args = conn.calls[-1]
    assert sql.startswith("insert into alert_rules") and args[2] == "Leases" and "conditions" in args[4]


def test_notifications_api_clears_verification_on_change(make_client):
    client, conn = make_client([("select email, mobile, email_verified, mobile_verified from notification_prefs", [Row(email="old@x", mobile="", email_verified=True, mobile_verified=False)])])
    r = client.put("/api/me/notifications", json={"email": "new@x", "mobile": "", "teamsWebhook": "", "quietHours": {"enabled": True, "from": "21:00", "to": "07:00"}, "digestHour": 8, "weeklyDay": 1}, headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 200 and r.json()["emailVerified"] is False
    r = client.post("/api/me/notifications/verify", json={"channel": "fax"}, headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 400


@pytest.mark.parametrize("path", ["/api/alerts/deliveries", "/api/staff", "/api/alerts/state"])
def test_alert_list_endpoints_shape(make_client, path):
    client, _ = make_client([("from alert_deliveries", []), ("from staff", []), ("from alert_state", [])])
    r = client.get(path, headers={"X-Demo-User": "demo-agent"})
    assert r.status_code == 200
