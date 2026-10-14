"""Rule matcher: the Python twin of src/lib/alerts.ts matchRule.

A rule (as the UI saves it, JSON) is tested against an alert row plus the context the worker
resolves: the business behind the event (distress flags, tenure), the title (proprietor
categories, tenure), the deal score, the user's watch items and their centres. Every failed test
is named so the API can explain a miss when the editor asks for a dry run.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

DISTRESS_KINDS = {"Distress signal", "Gazette notice", "Company status", "New charge", "Regulator enforcement", "Late accounts"}

OFFICE_PATCHES = {
    "CV": "Birmingham", "B": "Birmingham", "WS": "Birmingham", "DY": "Birmingham", "WR": "Birmingham",
    "BS": "Bristol", "BA": "Bristol", "GL": "Bristol", "TA": "Bristol",
    "M": "Manchester", "SK": "Manchester", "WA": "Manchester",
    "LS": "Leeds", "BD": "Leeds", "HG": "Leeds",
    "E": "London", "EC": "London", "N": "London", "NW": "London", "SE": "London", "SW": "London", "W": "London", "WC": "London",
    "EH": "Edinburgh", "G": "Glasgow", "EX": "Exeter", "NG": "Nottingham", "NE": "Newcastle", "CF": "Cardiff",
}


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6_371_000.0
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dlat = la2 - la1
    dlon = math.radians(b[0] - a[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def outward(pc: str | None) -> str:
    return (pc or "").strip().upper().split()[0] if (pc or "").strip() else ""


@dataclass
class Context:
    business: dict[str, Any] | None = None
    title: dict[str, Any] | None = None
    deal_score: float | None = None
    watchlist: list[dict[str, Any]] = field(default_factory=list)
    site_centres: dict[str, tuple[float, float]] = field(default_factory=dict)


@dataclass
class Match:
    match: bool
    reasons: list[str]


def match_rule(rule: dict[str, Any], alert: dict[str, Any], ctx: Context) -> Match:
    reasons: list[str] = []
    c = rule.get("conditions", {})

    def fail(why: str) -> Match:
        return Match(False, [*reasons, why])

    if not rule.get("enabled", True):
        return fail("rule paused")
    kinds = c.get("kinds") or []
    if kinds and alert["kind"] not in kinds:
        return fail(f"kind {alert['kind']} not selected")
    reasons.append(f"kind {alert['kind']}" if kinds else "any kind")
    sev = c.get("severities") or []
    if sev and alert.get("severity") not in sev:
        return fail(f"severity {alert.get('severity')} below threshold")
    sectors = c.get("sectors") or []
    if sectors:
        if not alert.get("sector") or alert["sector"] not in sectors:
            return fail(f"sector {alert.get('sector') or 'unknown'} not selected")
        reasons.append(f"sector {alert['sector']}")
    kw = (c.get("keywords") or "").strip()
    if kw:
        words = [w for w in kw.lower().replace(",", " ").split() if w]
        hay = f"{alert.get('title', '')} {alert.get('detail', '')}".lower()
        hit = next((w for w in words if w in hay), None)
        if not hit:
            return fail(f'none of "{kw}" in the text')
        reasons.append(f'mentions "{hit}"')
    flags = (ctx.business or {}).get("distressFlags") or []
    if c.get("distressOnly") or c.get("distressFlags"):
        wanted = c.get("distressFlags") or []
        if wanted:
            hit = next((f for f in wanted if f in flags), None)
            if not hit:
                return fail(f"no {'/'.join(wanted)} flag on the operator")
            reasons.append(f"flag {hit}")
        elif not flags and alert["kind"] not in DISTRESS_KINDS:
            return fail("no distress signal on the operator")
        else:
            reasons.append(f"{len(flags)} distress flag(s)" if flags else "distress event")
    if c.get("minDealScore") is not None:
        if ctx.deal_score is None or ctx.deal_score < c["minDealScore"]:
            return fail(f"deal score {ctx.deal_score if ctx.deal_score is not None else 'n/a'} below {c['minDealScore']}")
        reasons.append(f"score {ctx.deal_score}")
    owners = c.get("ownerCategories") or []
    if owners:
        cats = [p.get("category") for p in (ctx.title or {}).get("proprietors", [])]
        hit = next((o for o in owners if o in cats), None)
        if not hit:
            return fail(f"owner is {cats[0] if cats else 'unknown'}")
        reasons.append(f"owner {hit}")
    if c.get("tenure"):
        t = (ctx.business or {}).get("tenure") or (ctx.title or {}).get("tenure")
        if t != c["tenure"]:
            return fail(f"tenure {t or 'unknown'}")
        reasons.append(c["tenure"])

    s = rule.get("scope", {"mode": "everywhere"})
    mode = s.get("mode", "everywhere")
    loc = alert.get("location")

    def nearest(ids: list[str]):
        if not loc:
            return None
        best = None
        for i in ids:
            centre = ctx.site_centres.get(i)
            if not centre:
                continue
            d = haversine_m(centre, (loc[0], loc[1]))
            if best is None or d < best[1]:
                best = (i, d)
        return best

    if mode in ("my-sites", "pipeline", "sites"):
        if mode == "sites":
            ids = list(s.get("siteIds") or [])
        else:
            items = ctx.watchlist
            if mode == "pipeline":
                items = [w for w in items if w.get("stage") and w["stage"] not in ("Lost", "Completed")]
            ids = [w["entityId"] for w in items]
        keys = {alert.get("entityId"), alert.get("businessId"), alert.get("titleNumber")}
        if any(i in keys for i in ids):
            reasons.append("on a watched site")
        else:
            b = nearest(ids)
            radius = float(s.get("radiusM") or 0)
            if not b or b[1] > radius:
                return fail(f"nearest watched site {round(b[1])} m away (radius {int(radius)} m)" if b else "not near any watched site")
            reasons.append(f"{round(b[1])} m from a watched site")
    elif mode == "postcodes":
        o = outward(alert.get("postcode"))
        wanted = [p.upper() for p in (s.get("postcodes") or [])]
        if not o or o not in wanted:
            return fail(f"postcode {o or 'unknown'} outside {', '.join(wanted)}")
        reasons.append(f"postcode {o}")
    elif mode == "offices":
        area = "".join(ch for ch in outward(alert.get("postcode")) if ch.isalpha())
        patch = OFFICE_PATCHES.get(area)
        if not patch or patch not in (s.get("offices") or []):
            return fail(f"postcode area {area or 'unknown'} is not in {', '.join(s.get('offices') or [])} patch")
        reasons.append(f"{patch} patch")
    return Match(True, reasons)
