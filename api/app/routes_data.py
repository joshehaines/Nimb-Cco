"""Routes over the loaded data that main.py used to answer with 501: title detail sections, record lookups,
companies, alerts, sourcing, nearby businesses, catchment, derived comparables, document orders and CRM matching.

Shapes follow src/data/types.ts (the mock provider is the contract). Every query is bounded and indexed; the map
once timed out on a 1 km viewport, so nothing here scans a table unfiltered.
"""
from __future__ import annotations

import difflib
import json
import os
import re
import statistics
from datetime import date, datetime, timezone
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request

from .auth import User, current_user
from ingest._upsert import norm_company_sql

router = APIRouter(prefix="/api")

BUSINESS_COLS = "b.business_id, b.name, b.sector, b.sub_sector, b.address, b.postcode, b.uprn, b.title_number, b.tenure, b.operator_company_number, b.operator_name, b.freeholder_name, b.freeholder_company_number, b.hereditament_uarn, b.epc_certificate_id, b.fhrs_rating, b.distress_flags, b.source, b.licence, b.fetched_at, ST_X(b.geom) lon, ST_Y(b.geom) lat"


def _iso(v) -> str | None:
    return v.isoformat() if v is not None and hasattr(v, "isoformat") else v


def _tag(r) -> dict[str, Any]:
    return {"source": r["source"], "licence": r["licence"], "fetchedAt": _iso(r["fetched_at"])}


def _pt(lon, lat) -> dict[str, Any] | None:
    return {"type": "Point", "coordinates": [lon, lat]} if lon is not None and lat is not None else None


def _jsonb(v):
    return json.loads(v) if isinstance(v, str) else (v if v is not None else None)


def _num(v):
    return float(v) if v is not None else None


def register_json(r) -> dict[str, Any]:
    return {**_tag(r), "register": r["register"], "registerId": r["register_id"], "name": r["name"], "providerName": r["provider_name"], "providerId": r["provider_id"], "status": r["status"],
            "registeredAt": _iso(r["registered_at"]), "rating": r["rating"], "ratingDate": _iso(r["rating_date"]), "capacity": r["capacity"], "capacityLabel": r["capacity_label"], "extra": _jsonb(r["extra"]) or {}}


def business_json(b, registers: list[dict[str, Any]], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        **_tag(b), "businessId": b["business_id"], "name": b["name"], "sector": b["sector"], "subSector": b["sub_sector"], "address": b["address"] or "", "postcode": b["postcode"] or "",
        "uprn": str(b["uprn"]) if b["uprn"] else None, "location": _pt(b["lon"], b["lat"]), "titleNumber": b["title_number"], "tenure": b["tenure"],
        "operatorCompanyNumber": b["operator_company_number"], "operatorName": b["operator_name"], "freeholderName": b["freeholder_name"], "freeholderCompanyNumber": b["freeholder_company_number"],
        "hereditamentUarn": b["hereditament_uarn"], "epcCertificateId": b["epc_certificate_id"], "fhrsRating": b["fhrs_rating"], "distressFlags": list(b["distress_flags"] or []), "registers": registers,
        **(extra or {}),
    }


async def businesses_json(c: asyncpg.Connection, rows: list, extras: dict[str, dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Serialise business rows with their register records fetched in one query (no N+1)."""
    if not rows:
        return []
    ids = [r["business_id"] for r in rows]
    regs = await c.fetch("select br.business_id, r.* from business_registers br join register_records r using (register, register_id) where br.business_id = any($1::text[])", ids)
    by_id: dict[str, list[dict[str, Any]]] = {}
    for r in regs:
        by_id.setdefault(r["business_id"], []).append(register_json(r))
    return [business_json(b, by_id.get(b["business_id"], []), (extras or {}).get(b["business_id"])) for b in rows]


def proprietor_json(p) -> dict[str, Any]:
    return {"name": "Private individual" if p["redacted"] else p["name"], "category": p["category"], "companyNumber": p["company_number"], "address": p["address"], "redacted": p["redacted"]}


async def titles_json(c: asyncpg.Connection, rows: list) -> list[dict[str, Any]]:
    if not rows:
        return []
    nums = [r["title_number"] for r in rows]
    props = await c.fetch("select * from proprietors where title_number = any($1::text[]) order by title_number, seq", nums)
    by_t: dict[str, list[dict[str, Any]]] = {}
    for p in props:
        by_t.setdefault(p["title_number"], []).append(proprietor_json(p))
    out = []
    for t in rows:
        out.append({
            **_tag(t), "titleNumber": t["title_number"], "inspireId": t["inspire_id"], "tenure": t["tenure"], "address": t["address"] or "", "postcode": t["postcode"] or "",
            "uprn": str(t["uprn"]) if t["uprn"] else None, "geometry": t["geojson"], "areaSqm": float(t["area_sqm"] or 0), "proprietors": by_t.get(t["title_number"], []),
            "pricePaid": t["price_paid"], "pricePaidDate": _iso(t["price_paid_date"]), "dateProprietorAdded": _iso(t["date_proprietor_added"]), "leases": [],
            "registerPurchased": t["register_purchased"], "titlePlanPurchased": t["title_plan_purchased"], "charges": [],
        })
    return out


TITLE_COLS = "t.*, ST_AsGeoJSON(t.geom)::json geojson"


def hereditament_json(h) -> dict[str, Any]:
    return {**_tag(h), "uarn": h["uarn"], "uprn": str(h["uprn"]) if h["uprn"] else None, "address": h["address"] or "", "postcode": h["postcode"] or "", "description": h["description"] or "",
            "scatCode": h["scat_code"] or "", "rateableValue": h["rateable_value"] or 0, "listYear": h["list_year"] or 2026, "totalAreaSqm": _num(h["total_area_sqm"]), "floors": _jsonb(h["floors"]),
            "effectiveDate": _iso(h["effective_date"]), "deleted": h["deleted"]}


def epc_json(e) -> dict[str, Any]:
    return {**_tag(e), "certificateId": e["certificate_id"], "uprn": str(e["uprn"]) if e["uprn"] else None, "address": e["address"] or "", "postcode": e["postcode"] or "", "kind": e["kind"],
            "rating": e["rating"], "score": e["score"], "floorAreaSqm": _num(e["floor_area_sqm"]), "lodgedAt": _iso(e["lodged_at"]), "expiresAt": _iso(e["expires_at"]), "mainHeating": e["main_heating"]}


PLANNING_STATUS = {"permitted": "Approved", "approved": "Approved", "granted": "Approved", "refused": "Refused", "rejected": "Refused", "withdrawn": "Withdrawn", "undecided": "Pending", "pending": "Pending", "registered": "Pending", "appeal": "Appeal"}
PLANNING_TYPE = {"full": "Full", "outline": "Outline", "change of use": "Change of Use", "listed": "Listed Building", "prior": "Prior Approval", "advert": "Advertisement"}


def _planning_status(s: str | None) -> str:
    low = (s or "").lower()
    for k, v in PLANNING_STATUS.items():
        if k in low:
            return v
    return "Pending" if not low else "Other"


def _planning_type(s: str | None) -> str:
    low = (s or "").lower()
    for k, v in PLANNING_TYPE.items():
        if k in low:
            return v
    return "Other"


def planning_json(p, title_numbers: list[str] | None = None) -> dict[str, Any]:
    return {**_tag(p), "reference": p["reference"], "authority": p["authority"], "address": p["address"] or "", "postcode": p["postcode"] or "", "location": _pt(p["lon"], p["lat"]),
            "description": p["description"] or "", "applicant": p["applicant"], "agent": p["agent"], "type": _planning_type(p["type"]), "status": _planning_status(p["status"]),
            "receivedDate": _iso(p["received_date"]), "decisionDate": _iso(p["decision_date"]), "portalUrl": p["portal_url"] or "", "titleNumbers": title_numbers or [], "summary": p["summary"]}


PLANNING_COLS = "p.*, ST_X(p.geom) lon, ST_Y(p.geom) lat"

COMPANY_STATUS = [("dissolved", "dissolved"), ("liquidation", "liquidation"), ("administration", "administration"), ("receiver", "receivership"), ("dormant", "dormant")]


def company_json(r) -> dict[str, Any]:
    low = (r["status"] or "").lower()
    status = next((v for k, v in COMPANY_STATUS if k in low), "active")
    notices = _jsonb(r["gazette_notices"]) or []
    return {**_tag(r), "companyNumber": r["company_number"], "name": r["name"], "status": status, "statusText": r["status"], "incorporated": _iso(r["incorporated"]), "sicCodes": list(r["sic_codes"] or []),
            "registeredAddress": r["registered_address"] or "", "accountsOverdue": r["accounts_overdue"], "lastAccountsMadeUpTo": _iso(r["last_accounts_made_up_to"]),
            "charges": _jsonb(r["charges"]) or [], "officers": _jsonb(r["officers"]) or [], "pscs": _jsonb(r["pscs"]) or [], "parentCompanyNumber": r["parent_company_number"],
            "gazetteNotices": [{"type": n.get("category") or n.get("type") or "Notice", "date": n.get("published") or n.get("date"), "link": n.get("link")} for n in notices if isinstance(n, dict)]}


# ------------------------------------------------------------------ title sections
async def _title_or_404(c: asyncpg.Connection, title_number: str):
    t = await c.fetchrow("select title_number, geom, postcode, ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat from titles where title_number = $1", title_number)
    if not t:
        raise HTTPException(404)
    return t


@router.get("/titles/{title_number}/voa")
async def title_voa(req: Request, title_number: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        t = await _title_or_404(c, title_number)
        rows = await c.fetch(
            "select distinct h.* from hereditaments h join businesses b on b.hereditament_uarn = h.uarn where b.title_number = $1 "
            "union select h.* from hereditaments h where $2::text is not null and h.postcode = $2 and not h.deleted and not exists (select 1 from businesses b where b.title_number = $1) limit 20",
            title_number, t["postcode"],
        )
    return [hereditament_json(h) for h in rows]


@router.get("/titles/{title_number}/epc")
async def title_epc(req: Request, title_number: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        await _title_or_404(c, title_number)
        rows = await c.fetch("select distinct e.* from epcs e join businesses b on b.epc_certificate_id = e.certificate_id where b.title_number = $1 order by e.lodged_at desc nulls last limit 20", title_number)
    return [epc_json(e) for e in rows]


@router.get("/titles/{title_number}/planning")
async def title_planning(req: Request, title_number: str, radius: float | None = None, user: User = Depends(current_user)):
    """Applications on the title (point inside the polygon) or, with a radius, within that many metres of its centroid."""
    async with req.app.state.pool.acquire() as c:
        t = await _title_or_404(c, title_number)
        if t["lon"] is None:
            return []
        if radius:
            rows = await c.fetch(f"select {PLANNING_COLS} from planning_applications p where p.geom is not null and ST_DWithin(p.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) order by p.received_date desc nulls last limit 200", t["lon"], t["lat"], radius)
        else:
            rows = await c.fetch(f"select {PLANNING_COLS} from planning_applications p where p.geom is not null and ST_Intersects(p.geom, (select geom from titles where title_number = $1)) order by p.received_date desc nulls last limit 100", title_number)
    return [planning_json(p, [title_number] if not radius else None) for p in rows]


@router.get("/titles/{title_number}/constraints")
async def title_constraints(req: Request, title_number: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        await _title_or_404(c, title_number)
        rows = await c.fetch(
            "with t as (select geom from titles where title_number = $1) "
            "select k.id, k.kind, k.name, k.grade, k.source, k.licence, k.fetched_at, ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Intersection(k.geom, ST_Expand((select geom from t), 0.003)), 0.00002))::json geojson "
            "from constraints k, t where k.geom && t.geom and ST_Intersects(k.geom, t.geom) limit 50",
            title_number,
        )
    return [{**_tag(k), "id": k["id"], "kind": k["kind"], "name": k["name"] or k["kind"], "grade": k["grade"], "geometry": k["geojson"]} for k in rows]


# ------------------------------------------------------------------ records
@router.get("/voa/{uarn}")
async def get_hereditament(req: Request, uarn: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        h = await c.fetchrow("select * from hereditaments where uarn = $1", uarn)
    if not h:
        raise HTTPException(404)
    return hereditament_json(h)


@router.get("/epc/{certificate_id}")
async def get_epc(req: Request, certificate_id: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        e = await c.fetchrow("select * from epcs where certificate_id = $1", certificate_id)
    if not e:
        raise HTTPException(404)
    return epc_json(e)



@router.get("/planning")
async def planning_for_authority(req: Request, authority: str, limit: int = 5000, user: User = Depends(current_user)):
    """Every loaded application for one authority, for decision statistics (approval rate, time to decide, by type)."""
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(f"select {PLANNING_COLS} from planning_applications p where p.authority = $1 order by p.received_date desc nulls last limit $2", authority, max(1, min(limit, 20000)))
    return [planning_json(p) for p in rows]


_DASH: dict[str, Any] = {}


@router.get("/dashboard")
async def dashboard(req: Request, user: User = Depends(current_user)):
    """Headline counts for the dashboard, cached for ten minutes (the title and proprietor counts cover millions of rows)."""
    now = datetime.now(timezone.utc)
    if _DASH.get("at") and (now - _DASH["at"]).total_seconds() < 600:
        return {**_DASH["body"], "unreadAlerts": await _unread(req, user)}
    async with req.app.state.pool.acquire() as c:
        b = await c.fetchrow("select count(*) n, count(*) filter (where cardinality(distress_flags) > 0) distressed from businesses")
        by_sector = await c.fetch("select sector, count(*) n from businesses group by sector order by n desc")
        titles = await c.fetchval("select count(*) from titles where geom is not null")
        corporate = await c.fetchval("select count(*) from proprietors where seq = 1 and category <> 'Private Individual' and title_number in (select title_number from titles where geom is not null)")
        leases = await c.fetchval("select count(*) from leases where expiry_date between current_date and current_date + interval '36 months'")
    body = {"businesses": b["n"], "distressed": b["distressed"], "bySector": [{"sector": r["sector"], "count": r["n"]} for r in by_sector], "titles": titles, "corporateTitles": corporate, "leaseEvents36m": leases, "asOf": now.isoformat()}
    _DASH.update({"at": now, "body": body})
    return {**body, "unreadAlerts": await _unread(req, user)}


async def _unread(req: Request, user: User) -> int:
    async with req.app.state.pool.acquire() as c:
        return await c.fetchval(
            "select count(*) from alerts a left join alert_state s on s.alert_id = a.alert_id::text and s.user_id = $1 "
            "where (a.user_id is null or a.user_id = $1) and a.occurred_at > now() - interval '90 days' and not coalesce(s.read, a.read, false) and not coalesce(s.dismissed, false)", user.id,
        ) or 0

@router.get("/planning/{reference:path}")
async def get_planning(req: Request, reference: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        p = await c.fetchrow(f"select {PLANNING_COLS} from planning_applications p where p.reference = $1 or p.authority || '/' || p.reference = $1 order by p.received_date desc nulls last limit 1", reference)
        if not p:
            raise HTTPException(404)
        tn = await c.fetch("select title_number from titles where geom is not null and ST_Contains(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) limit 3", p["lon"], p["lat"]) if p["lon"] is not None else []
    return planning_json(p, [r["title_number"] for r in tn])


# ------------------------------------------------------------------ companies
@router.get("/companies/{company_number}")
async def get_company(req: Request, company_number: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        r = await c.fetchrow("select * from companies where company_number = $1", company_number.upper().zfill(8) if company_number.isdigit() else company_number.upper())
    if not r:
        raise HTTPException(404)
    return company_json(r)


@router.get("/companies/{company_number}/group")
async def company_group(req: Request, company_number: str, user: User = Depends(current_user)):
    """The root (via parent_company_number) and every company that names it as parent."""
    async with req.app.state.pool.acquire() as c:
        me = await c.fetchrow("select company_number, parent_company_number from companies where company_number = $1", company_number)
        if not me:
            return []
        root = me["parent_company_number"] or me["company_number"]
        rows = await c.fetch("select * from companies where company_number = $1 union all select * from companies where parent_company_number = $1 and company_number <> $1 limit 200", root)
    return [company_json(r) for r in rows]


@router.get("/companies/{company_number}/titles")
async def company_titles(req: Request, company_number: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(f"select {TITLE_COLS} from titles t where t.title_number in (select title_number from proprietors where company_number = $1) order by t.price_paid desc nulls last limit 500", company_number)
        return await titles_json(c, rows)


@router.get("/companies/{company_number}/businesses")
async def company_businesses(req: Request, company_number: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(f"select {BUSINESS_COLS} from businesses b where b.operator_company_number = $1 or b.freeholder_company_number = $1 order by b.name limit 500", company_number)
        return await businesses_json(c, rows)


# ------------------------------------------------------------------ nearby, catchment
@router.get("/businesses/near")
async def businesses_near(req: Request, lon: float, lat: float, radius: float = 1000, sector: str | None = None, limit: int = 500, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(
            f"select {BUSINESS_COLS}, ST_DistanceSphere(b.geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) distance_m from businesses b "
            "where ST_DWithin(b.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) and ($4::text is null or b.sector = $4) order by distance_m limit $5",
            lon, lat, radius, sector, max(1, min(limit, 2000)),
        )
        return await businesses_json(c, rows, {r["business_id"]: {"distanceM": round(r["distance_m"])} for r in rows})


RATIOS = [
    ("Care Home", "Care beds per 100 people aged 85+", "capacity", "age85plus", 100, 11.5, "beds", "Below the England average suggests unmet need and headroom for a new or expanded home."),
    ("Childcare", "Nursery places per 100 children aged 0-4", "capacity", "age0to4", 100, 34, "places", "Low coverage indicates demand headroom for a new setting."),
    ("Pub", "Pubs per 10,000 adults", "count", "adults", 10000, 8.1, "pubs", "High density means tougher trading; low density with strong footfall supports a new site."),
    ("Pharmacy", "Pharmacies per 10,000 people", "count", "population", 10000, 2.1, "pharmacies", "NHS contract coverage; above average weakens a new application."),
    ("Dental", "Dental practices per 10,000 people", "count", "population", 10000, 1.9, "practices", "Low coverage supports NHS and private list growth."),
]


@router.get("/catchment")
async def catchment(req: Request, lon: float, lat: float, radius: float = 1500, user: User = Depends(current_user)):
    """Competitor supply from the registers; population estimated from postcode density until ONS Census is loaded."""
    async with req.app.state.pool.acquire() as c:
        biz = await c.fetch(
            f"select {BUSINESS_COLS}, ST_DistanceSphere(b.geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) distance_m, "
            "(select max(r.capacity) from business_registers br join register_records r using (register, register_id) where br.business_id = b.business_id) capacity, "
            "(select max(r.capacity_label) from business_registers br join register_records r using (register, register_id) where br.business_id = b.business_id) capacity_label, "
            "(select max(r.rating) from business_registers br join register_records r using (register, register_id) where br.business_id = b.business_id) rating "
            "from businesses b where ST_DWithin(b.geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) order by distance_m limit 3000",
            lon, lat, radius,
        )
        pcs = await c.fetchval("select count(*) from postcode_centroids where ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)", lon, lat, radius) or 0
        traffic = await c.fetchval("select max(aadf) from traffic_counts where ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)", lon, lat, max(radius, 800.0))
        places = await c.fetch(
            "select place_id, name, category, sector, address, postcode, ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) distance_m from places "
            "where ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) order by distance_m limit 500", lon, lat, radius,
        )
    # ONS small-area figures are not loaded yet: a live postcode unit averages about 15 households of 2.36 people.
    households = int(pcs * 15)
    population = int(households * 2.36)
    ages = {"age0to4": round(population * 0.056), "age65plus": round(population * 0.19), "age85plus": round(population * 0.026), "adults": round(population * 0.80), "population": population}
    by_sector: dict[str, dict[str, Any]] = {}
    for b in biz:
        cur = by_sector.setdefault(b["sector"], {"sector": b["sector"], "count": 0, "capacity": 0, "capacityLabel": None})
        cur["count"] += 1
        cur["capacity"] += b["capacity"] or 0
        cur["capacityLabel"] = cur["capacityLabel"] or b["capacity_label"]
    ratios = []
    for sector, label, field, denom, per, benchmark, unit, note in RATIOS:
        num = by_sector.get(sector, {}).get(field, 0)
        d = ages[denom]
        ratios.append({"label": label, "value": round(num / d * per, 1) if d else 0, "benchmark": benchmark, "unit": unit, "better": "lower", "note": note})
    real_counts: dict[str, int] = {}
    for p in places:
        real_counts[p["sector"]] = real_counts.get(p["sector"], 0) + 1
    return {
        "centre": [lon, lat], "radiusM": radius, "population": population, "households": households, **{k: v for k, v in ages.items() if k != "population"},
        "medianHouseholdIncome": None, "affluenceIndex": None, "deprivationDecile": None,
        "competitors": sorted(by_sector.values(), key=lambda x: -x["count"]),
        "nearest": [{"businessId": b["business_id"], "name": b["name"], "sector": b["sector"], "distanceM": round(b["distance_m"]), "capacity": b["capacity"], "rating": b["rating"], "operatorName": b["operator_name"]} for b in biz[:12]],
        "ratios": ratios, "footfallMonthly": None, "trafficAadf": traffic,
        "realSupply": {"source": "Overture Maps places (CDLA-Permissive-2.0)", "counts": sorted(({"sector": s, "count": n} for s, n in real_counts.items()), key=lambda x: -x["count"]),
                       "nearest": [{"id": p["place_id"], "name": p["name"] or p["category"], "category": p["category"], "sector": p["sector"], "distanceM": round(p["distance_m"]), "address": p["address"], "postcode": p["postcode"]} for p in places[:12]]} if places else None,
        "source": "CQC, Ofsted, NHSBSA and FSA registers; DfT traffic; population estimated from Code-Point Open postcode density (ONS Census not yet loaded)",
    }


@router.get("/footfall")
async def footfall(req: Request, lon: float, lat: float, radius: float = 300, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(
            "select h3, monthly_visits, band, trend_12m, dwell_minutes, source, licence, fetched_at, ST_AsGeoJSON(geom)::json geojson from footfall_cells "
            "where month = (select max(month) from footfall_cells) and ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) limit 500", lon, lat, radius,
        )
    return [{**_tag(r), "h3": r["h3"], "geometry": r["geojson"], "monthlyVisits": r["monthly_visits"], "band": r["band"], "trend12m": _num(r["trend_12m"]), "dwellMinutes": _num(r["dwell_minutes"])} for r in rows]


# ------------------------------------------------------------------ alerts
def alert_json(a, read: bool) -> dict[str, Any]:
    return {"alertId": str(a["alert_id"]), "kind": a["kind"], "title": a["title"], "detail": a["detail"], "occurredAt": _iso(a["occurred_at"]), "severity": a["severity"], "entityType": a["entity_type"],
            "entityId": a["entity_id"], "read": read, "sector": a["sector"], "businessId": a["business_id"], "titleNumber": a["title_number"], "postcode": a["postcode"],
            "location": [a["lon"], a["lat"]] if a["lon"] is not None else None}


@router.get("/alerts")
async def list_alerts(req: Request, days: int = 90, limit: int = 500, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(
            "select a.*, coalesce(s.read, a.read, false) is_read from alerts a left join alert_state s on s.alert_id = a.alert_id::text and s.user_id = $1 "
            "where (a.user_id is null or a.user_id = $1) and a.occurred_at > now() - make_interval(days => $2) and coalesce(s.dismissed, false) = false order by a.occurred_at desc limit $3",
            user.id, max(1, min(days, 365)), max(1, min(limit, 2000)),
        )
    return [alert_json(a, a["is_read"]) for a in rows]


@router.post("/alerts/{alert_id}/read")
async def mark_alert_read(req: Request, alert_id: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        await c.execute("insert into alert_state (user_id, alert_id, read) values ($1, $2, true) on conflict (user_id, alert_id) do update set read = true", user.id, alert_id)
    return {}


# ------------------------------------------------------------------ sourcing
EPC_ORDER = ["A+", "A", "B", "C", "D", "E", "F", "G"]


def _sourcing_sql(f: dict[str, Any], bounds: dict[str, Any] | None) -> tuple[str, list[Any]]:
    """WHERE clauses for sourcing filters over businesses b (with optional joins via subqueries). Unsupported filters
    (lease dates, footprint, constraints, planning window) are ignored rather than returning nothing."""
    where, params = ["true"], []

    def p(v):
        params.append(v)
        return f"${len(params)}"

    if bounds:
        where.append(f"b.geom && ST_MakeEnvelope({p(float(bounds['west']))},{p(float(bounds['south']))},{p(float(bounds['east']))},{p(float(bounds['north']))},4326)")
    if f.get("sectors"):
        where.append(f"b.sector = any({p(list(f['sectors']))}::text[])")
    if f.get("tenure"):
        where.append(f"b.tenure = {p(f['tenure'])}")
    if f.get("distressOnly"):
        where.append("cardinality(b.distress_flags) > 0")
    if f.get("distressFlags"):
        where.append(f"b.distress_flags && {p(list(f['distressFlags']))}::text[]")
    if f.get("text"):
        t = "%" + str(f["text"]).strip() + "%"
        where.append(f"(b.name ilike {p(t)} or b.address ilike {p(t)} or b.operator_name ilike {p(t)} or b.freeholder_name ilike {p(t)})")
    if f.get("registerRatings"):
        where.append(f"exists (select 1 from business_registers br join register_records r using (register, register_id) where br.business_id = b.business_id and r.rating = any({p([str(x) for x in f['registerRatings']])}::text[]))")
    if f.get("minRateableValue") is not None or f.get("maxRateableValue") is not None:
        lo, hi = int(f.get("minRateableValue") or 0), int(f.get("maxRateableValue") or 10**9)
        where.append(f"exists (select 1 from hereditaments h where h.uarn = b.hereditament_uarn and h.rateable_value between {p(lo)} and {p(hi)})")
    if f.get("epcWorseThan") in EPC_ORDER:
        worse = EPC_ORDER[EPC_ORDER.index(f["epcWorseThan"]) + 1:]
        where.append(f"exists (select 1 from epcs e where e.certificate_id = b.epc_certificate_id and e.rating = any({p(worse)}::text[]))")
    if f.get("minAreaSqm") is not None or f.get("maxAreaSqm") is not None:
        lo, hi = float(f.get("minAreaSqm") or 0), float(f.get("maxAreaSqm") or 1e12)
        where.append(f"exists (select 1 from titles t where t.title_number = b.title_number and t.area_sqm between {p(lo)} and {p(hi)})")
    if f.get("ownerCategories"):
        where.append(f"exists (select 1 from proprietors pr where pr.title_number = b.title_number and pr.category = any({p(list(f['ownerCategories']))}::text[]))")
    if f.get("ownedSince"):
        where.append(f"exists (select 1 from titles t where t.title_number = b.title_number and t.date_proprietor_added <= {p(f['ownedSince'])}::date)")
    if f.get("distressedOwners"):
        where.append("exists (select 1 from companies c where c.company_number = b.freeholder_company_number and (c.status not ilike 'active%' or c.accounts_overdue or jsonb_array_length(coalesce(c.gazette_notices,'[]'::jsonb)) > 0))")
    if f.get("distressedTenants"):
        where.append("(b.tenure = 'Leasehold' or b.freeholder_company_number is distinct from b.operator_company_number) and exists (select 1 from companies c where c.company_number = b.operator_company_number and (c.status not ilike 'active%' or c.accounts_overdue or jsonb_array_length(coalesce(c.gazette_notices,'[]'::jsonb)) > 0))")
    return " and ".join(where), params


@router.post("/sourcing/businesses")
async def source_businesses(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    f, bounds = body.get("filters") or {}, body.get("bounds")
    where, params = _sourcing_sql(f, bounds)
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(f"select {BUSINESS_COLS} from businesses b where {where} order by cardinality(b.distress_flags) desc, b.name limit 2000", *params)
        return await businesses_json(c, rows)


@router.post("/sourcing/titles")
async def source_titles(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    f, bounds = body.get("filters") or {}, body.get("bounds")
    where, params = ["t.geom is not null"], []

    def p(v):
        params.append(v)
        return f"${len(params)}"

    if bounds:
        where.append(f"t.geom && ST_MakeEnvelope({p(float(bounds['west']))},{p(float(bounds['south']))},{p(float(bounds['east']))},{p(float(bounds['north']))},4326)")
    if f.get("minAreaSqm") is not None:
        where.append(f"t.area_sqm >= {p(float(f['minAreaSqm']))}")
    if f.get("maxAreaSqm") is not None:
        where.append(f"t.area_sqm <= {p(float(f['maxAreaSqm']))}")
    if f.get("ownerCategories"):
        where.append(f"exists (select 1 from proprietors pr where pr.title_number = t.title_number and pr.category = any({p(list(f['ownerCategories']))}::text[]))")
    if f.get("text"):
        t = "%" + str(f["text"]).strip() + "%"
        where.append(f"(t.address ilike {p(t)} or exists (select 1 from proprietors pr where pr.title_number = t.title_number and pr.name ilike {p(t)}))")
    if not bounds and len(where) == 1:
        return []   # a title sweep needs a map area or a filter; 1.3M polygons is not a result
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(f"select {TITLE_COLS} from titles t where {' and '.join(where)} order by t.area_sqm desc nulls last limit 1000", *params)
        return await titles_json(c, rows)


# ------------------------------------------------------------------ comparables (derived from price paid + registers)
def _median(xs: list[float]) -> float | None:
    return statistics.median(xs) if xs else None


def _quantile(xs: list[float], q: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    k = (len(s) - 1) * q
    f, c = int(k), min(int(k) + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


COMP_SQL = f"""
select pp.transaction_id, pp.price, pp.sale_date, pp.postcode, pp.tenure sale_tenure, pp.address sale_address, pp.town, pp.source, pp.licence, pp.fetched_at,
       ST_X(pp.geom) lon, ST_Y(pp.geom) lat, b.business_id, b.name, b.sector, b.sub_sector, b.address, b.tenure, b.hereditament_uarn,
       (select max(r.capacity) from business_registers br join register_records r using (register, register_id) where br.business_id = b.business_id) capacity,
       (select max(r.capacity_label) from business_registers br join register_records r using (register, register_id) where br.business_id = b.business_id) capacity_label,
       (select h.rateable_value from hereditaments h where h.uarn = b.hereditament_uarn) rateable_value
from price_paid pp
join lateral (select * from businesses b where b.postcode = pp.postcode and similarity(upper(coalesce(b.address, '')), upper(coalesce(pp.address, ''))) > 0.3 order by similarity(upper(coalesce(b.address, '')), upper(coalesce(pp.address, ''))) desc limit 1) b on true
where pp.property_type = 'O' and pp.postcode is not null and pp.ppd_category in ('A', 'B')
"""


def comparable_json(r) -> dict[str, Any]:
    price = int(r["price"])
    cap, rv = r["capacity"], r["rateable_value"]
    return {**_tag(r), "compId": r["transaction_id"], "name": r["name"], "sector": r["sector"], "subSector": r["sub_sector"], "address": r["address"] or r["sale_address"] or "", "postcode": r["postcode"] or "",
            "location": _pt(r["lon"], r["lat"]), "date": _iso(r["sale_date"]), "price": price, "tenure": r["tenure"] or ("Leasehold" if (r["sale_tenure"] or "").upper().startswith("L") else "Freehold"),
            "capacity": cap, "capacityLabel": r["capacity_label"], "rateableValue": rv, "pricePerUnit": round(price / cap) if cap else None, "rvMultiple": round(price / rv, 1) if rv else None,
            "ebitdaMultiple": None, "buyerType": "Independent", "contributed": False, "confidence": "Derived", "businessId": r["business_id"]}


@router.post("/comparables/search")
async def comparables_search(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    """Trading-business sales derived by matching HM Land Registry non-residential transactions to a registered business
    at the same postcode and address. Confidence is 'Derived'; Christie & Co's own deals would be 'Verified'."""
    f = body.get("filters") or {}
    where, params = [], []

    def p(v):
        params.append(v)
        return f"${len(params)}"

    if f.get("sectors"):
        where.append(f"b.sector = any({p(list(f['sectors']))}::text[])")
    if f.get("tenure"):
        where.append(f"coalesce(b.tenure, case when upper(pp.tenure) like 'L%' then 'Leasehold' else 'Freehold' end) = {p(f['tenure'])}")
    if f.get("fromDate"):
        where.append(f"pp.sale_date >= {p(f['fromDate'])}::date")
    if f.get("toDate"):
        where.append(f"pp.sale_date <= {p(f['toDate'])}::date")
    if f.get("minPrice") is not None:
        where.append(f"pp.price >= {p(int(f['minPrice']))}")
    if f.get("maxPrice") is not None:
        where.append(f"pp.price <= {p(int(f['maxPrice']))}")
    if f.get("centre") and f.get("radiusM"):
        lon, lat = f["centre"]
        where.append(f"ST_DWithin(pp.geom::geography, ST_SetSRID(ST_MakePoint({p(float(lon))},{p(float(lat))}),4326)::geography, {p(float(f['radiusM']))})")
    if f.get("text"):
        t = "%" + str(f["text"]).strip() + "%"
        where.append(f"(b.name ilike {p(t)} or pp.address ilike {p(t)} or pp.postcode ilike {p(t)})")
    if f.get("contributedOnly"):
        return {"comps": [], "stats": {"count": 0, "byYear": []}}
    extra = (" and " + " and ".join(where)) if where else ""
    order = "pp.sale_date desc"
    if f.get("centre") and f.get("radiusM"):
        lon, lat = f["centre"]
        order = f"ST_DistanceSphere(pp.geom, ST_SetSRID(ST_MakePoint({p(float(lon))},{p(float(lat))}),4326))"
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(COMP_SQL + extra + f" order by {order} limit 500", *params)
    comps = [comparable_json(r) for r in rows]
    for r, comp in zip(rows, comps):
        if f.get("minCapacity") is not None and not (comp["capacity"] and comp["capacity"] >= f["minCapacity"]):
            comp["_drop"] = True
        if f.get("maxCapacity") is not None and not (comp["capacity"] and comp["capacity"] <= f["maxCapacity"]):
            comp["_drop"] = True
    comps = [x for x in comps if not x.pop("_drop", False)]
    prices = [float(x["price"]) for x in comps]
    ppu = [float(x["pricePerUnit"]) for x in comps if x["pricePerUnit"]]
    by_year: dict[int, list[float]] = {}
    for x in comps:
        by_year.setdefault(int(x["date"][:4]), []).append(float(x["price"]))
    stats = {"count": len(comps), "medianPrice": _median(prices), "medianPricePerUnit": _median(ppu), "medianRvMultiple": _median([float(x["rvMultiple"]) for x in comps if x["rvMultiple"]]),
             "medianEbitdaMultiple": None, "pricePerUnitRange": [_quantile(ppu, 0.25), _quantile(ppu, 0.75)] if ppu else None,
             "byYear": [{"year": y, "count": len(v), "medianPrice": _median(v)} for y, v in sorted(by_year.items())]}
    return {"comps": comps, "stats": stats}


@router.get("/comparables/{comp_id}")
async def get_comparable(req: Request, comp_id: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        r = await c.fetchrow(COMP_SQL + " and pp.transaction_id = $1 limit 1", comp_id)
    if not r:
        raise HTTPException(404)
    return comparable_json(r)


# ------------------------------------------------------------------ documents
def order_json(o) -> dict[str, Any]:
    return {"orderId": o["order_id"], "titleNumber": o["title_number"], "kind": o["kind"], "fee": float(o["fee"] or 0), "orderedAt": _iso(o["ordered_at"]), "status": o["status"], "fileName": o["file_name"], "parsedSummary": o["parsed_summary"]}


@router.get("/documents/orders")
async def list_orders(req: Request, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from document_orders order by ordered_at desc limit 500")
    return [order_json(o) for o in rows]


@router.post("/documents/orders")
async def order_document(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    """Records the order. Fulfilment needs HM Land Registry Business Gateway onboarding (client certificate), so the
    order stays Queued with a note until that job exists; the same document is never ordered twice."""
    tn, kind = str(body.get("titleNumber", "")).strip(), str(body.get("kind", "Register"))
    if not tn or kind not in ("Register", "Title Plan", "Lease", "Deed"):
        raise HTTPException(400, "titleNumber and a valid kind are required")
    async with req.app.state.pool.acquire() as c:
        if not await c.fetchval("select 1 from titles where title_number = $1", tn):
            raise HTTPException(404, "title not found")
        existing = await c.fetchrow("select * from document_orders where title_number = $1 and kind = $2", tn, kind)
        if existing:
            return order_json(existing)
        oid = f"DOC-{os.urandom(4).hex().upper()}"
        o = await c.fetchrow(
            "insert into document_orders (order_id, title_number, kind, fee, ordered_by, status, parsed_summary) values ($1, $2, $3, 7, $4, 'Queued', $5) returning *",
            oid, tn, kind, user.id if not user.demo else None, "Queued for HM Land Registry Business Gateway; fulfilment starts once the firm's Business e-services account and client certificate are configured.",
        )
        await c.execute("insert into audit_log (event_id, user_id, user_name, kind, summary, entity_type, entity_id, licences) values ($1, $2, $3, 'document-order', $4, 'title', $5, $6)",
                        f"L{os.urandom(6).hex()}", user.id, user.name, f"Ordered {kind} for {tn}", tn, ["HMLR-Doc"])
    return order_json(o)


# ------------------------------------------------------------------ CRM matching (same pipeline as the mock, over the database)
PC_RE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b", re.I)
SUFFIXES = ("limited", "ltd", "plc", "llp", "the", "and", "&", "co", "company", "group", "holdings")


def _norm_pc(v: str | None) -> str | None:
    if not v:
        return None
    s = re.sub(r"\s+", "", v.upper())
    return f"{s[:-3]} {s[-3:]}" if len(s) >= 5 and any(ch.isdigit() for ch in s) else None


def _norm_name(v: str | None) -> str:
    words = re.sub(r"[^a-z0-9 ]", " ", (v or "").lower()).split()
    return " ".join(w for w in words if w not in SUFFIXES)


def _norm_addr(v: str | None) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", (v or "").lower()).split())


def _sim(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def _company_number(v: str | None) -> str | None:
    s = re.sub(r"\s+", "", (v or "").upper())
    if re.fullmatch(r"\d{1,8}", s):
        return s.zfill(8)
    if re.fullmatch(r"[A-Z]{2}\d{6}", s):
        return s
    return None


@router.post("/crm/duplicates")
async def crm_duplicates(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    records = body.get("records") or []
    prepared = [{"r": r, "name": _norm_name(r.get("businessName")), "addr": _norm_addr(r.get("address")), "pc": _norm_pc(r.get("postcode")) or (lambda m: _norm_pc(m.group(0)) if m else None)(PC_RE.search(r.get("address") or "")), "cn": _company_number(r.get("companyNumber"))} for r in records]
    groups, used = [], set()
    for i, a in enumerate(prepared):
        if a["r"].get("recordId") in used:
            continue
        members = [a]
        for b in prepared[i + 1:]:
            if b["r"].get("recordId") in used:
                continue
            name_s, addr_s = _sim(a["name"], b["name"]), _sim(a["addr"], b["addr"])
            same_pc, same_cn = bool(a["pc"]) and a["pc"] == b["pc"], bool(a["cn"]) and a["cn"] == b["cn"]
            score = name_s * 0.5 + addr_s * 0.3 + (0.2 if same_pc else 0) + (0.15 if same_cn else 0)
            if (name_s > 0.85 and (same_pc or addr_s > 0.75)) or score > 0.85:
                members.append(b)
                used.add(b["r"].get("recordId"))
        if len(members) > 1:
            used.add(a["r"].get("recordId"))
            survivor = sorted(members, key=lambda m: ((m["r"].get("lastContact") or ""), 1 if m["cn"] else 0), reverse=True)[0]
            same = "postcode" if all(m["pc"] == members[0]["pc"] for m in members) else "address"
            groups.append({"groupId": f"DUP-{len(groups) + 1}", "recordIds": [m["r"].get("recordId") for m in members], "score": 0.9, "reason": f"Same business name and {same}", "survivorId": survivor["r"].get("recordId")})
    return groups


@router.post("/crm/match")
async def crm_match(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    records = body.get("records") or []
    out = []
    async with req.app.state.pool.acquire() as c:
        for r in records[:2000]:
            issues, reasons = [], []
            pc = _norm_pc(r.get("postcode"))
            if r.get("postcode") and not pc:
                issues.append("Postcode invalid")
            if not pc:
                m = PC_RE.search(r.get("address") or "")
                pc = _norm_pc(m.group(0)) if m else None
            r_name, r_addr = _norm_name(r.get("businessName")), _norm_addr(r.get("address"))
            cands = await c.fetch("select business_id, name, address, postcode, title_number, uprn, operator_company_number from businesses where postcode = $1 limit 200", pc) if pc else []
            if not cands and r_name:
                cands = await c.fetch("select business_id, name, address, postcode, title_number, uprn, operator_company_number from businesses where name ilike $1 limit 50", "%" + (r.get("businessName") or "").strip()[:40] + "%")
            best = None
            for b in cands:
                ns, as_ = _sim(r_name, _norm_name(b["name"])), _sim(r_addr, _norm_addr(b["address"]))
                ps = 1.0 if pc and pc == b["postcode"] else 0.0
                score = ns * 0.5 + as_ * 0.3 + ps * 0.2
                if not best or score > best[1]:
                    best = (b, score, [f"name {round(ns * 100)}%", f"address {round(as_ * 100)}%", "postcode exact" if ps else "postcode differs"])
            cn = _company_number(r.get("companyNumber"))
            company = await c.fetchrow("select company_number, status from companies where company_number = $1", cn) if cn else None
            if not company and r.get("companyName"):
                company = await c.fetchrow(f"select company_number, status from companies where {norm_company_sql('name')} = {norm_company_sql('$1::text')} order by (status ilike 'active%') desc limit 1", r["companyName"])
            if r.get("companyName") and not company:
                issues.append("Company not found")
            if company and any(k in (company["status"] or "").lower() for k in ("dissolved", "liquidation")):
                issues.append("Company dissolved")
            cand: dict[str, Any] = {"recordId": r.get("recordId"), "confidence": 0.0, "reasons": reasons, "issues": issues}
            if best and best[1] >= 0.62:
                b = best[0]
                reasons.extend(best[2])
                cand.update({"businessId": b["business_id"], "titleNumber": b["title_number"], "uprn": str(b["uprn"]) if b["uprn"] else None, "companyNumber": (company["company_number"] if company else b["operator_company_number"]), "confidence": round(min(0.99, best[1]), 2)})
            else:
                issues.append("Address unresolved")
                if company:
                    cand["companyNumber"] = company["company_number"]
            out.append(cand)
    return out
