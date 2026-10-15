"""
Christie Property Intelligence API (phase 2 backend skeleton).

Implements the contract in docs/API.md over PostGIS. Endpoints that are fully
wired return data from the database; the rest return 501 with a note so the
UI's HttpProvider fails loudly rather than silently.

Run locally:
    pip install -r api/requirements.txt
    psql "$DATABASE_URL" -f api/schema.sql
    uvicorn app.main:app --app-dir api --reload --port 8000
"""
from __future__ import annotations

import asyncio

import json
from datetime import datetime, timezone
import os
from contextlib import asynccontextmanager
from typing import Any

import asyncpg
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from .auth import User, current_user, require_role

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://cpi:cpi@localhost:5432/cpi")


async def _bootstrap_admin_when_ready(pool, attempts: int = 240, pause: float = 30.0) -> bool:
    """Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD. On a fresh server the API starts before
    the loader has created the tables, so keep trying (every 30 s, for two hours) until the schema exists."""
    from . import accounts

    for _ in range(attempts):
        try:
            async with pool.acquire() as c:
                if await accounts.bootstrap_admin(c):
                    print("created the first admin account from ADMIN_EMAIL")
            return True
        except Exception as e:  # noqa: BLE001
            if "does not exist" not in str(e):
                print(f"admin bootstrap skipped: {e}")
                return False
            await asyncio.sleep(pause)
    return False



async def _init_connection(conn: asyncpg.Connection) -> None:
    """asyncpg hands `json` columns back as text by default, so every ST_AsGeoJSON(...)::json geometry reached the
    browser as a string and neither MapLibre nor the site panel could use it. Decode json on the way out; jsonb is
    left alone because several handlers still pass json.dumps(...) for jsonb parameters and unpack on read."""
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

@asynccontextmanager
async def lifespan(app: FastAPI):
    if getattr(app.state, "pool", None) is None:
        app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10, init=_init_connection)
        app.state.bootstrap_task = asyncio.create_task(_bootstrap_admin_when_ready(app.state.pool))
    yield
    if getattr(app.state, "pool", None) is not None and hasattr(app.state.pool, "close"):
        await app.state.pool.close()


app = FastAPI(title="Christie Property Intelligence API", version="0.2.0", lifespan=lifespan)


@app.middleware("http")
async def require_auth(request: Request, call_next):
    """Every /api route except health needs a user; the dependency below does the actual check."""
    if request.url.path.startswith("/api") and request.url.path not in ("/api/health", "/api/auth/login", "/api/auth/mode"):
        try:
            request.state.user = await current_user(request)
        except HTTPException as e:
            return JSONResponse({"error": e.detail}, status_code=e.status_code)
    return await call_next(request)


def client_ts(v: Any) -> datetime | None:
    """A timestamp sent by the browser (ISO 8601, usually with a trailing Z) as an aware datetime; None when absent.
    asyncpg needs a datetime for a timestamptz parameter, so a raw string here fails the whole insert."""
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def not_implemented(what: str) -> JSONResponse:
    return JSONResponse({"error": f"{what} not implemented yet; see api/README.md"}, status_code=501)


def tag(row: asyncpg.Record) -> dict[str, Any]:
    return {"source": row["source"], "licence": row["licence"], "fetchedAt": row["fetched_at"].isoformat()}


# ------------------------------------------------------------------ health
@app.get("/api/health")
async def health(req: Request):
    async with req.app.state.pool.acquire() as c:
        n = await c.fetchval("select count(*) from titles")
        places = await c.fetchval("select count(*) from places")
        sales = await c.fetchval("select count(*) from price_paid")
    return {"ok": True, "provider": "postgis", "titles": n, "places": places, "pricePaid": sales}


# ------------------------------------------------------------------ search
@app.get("/api/search")
async def search(req: Request, q: str, limit: int = 12):
    out: list[dict[str, Any]] = []
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(
            """
            select business_id, name, sector, address, ST_X(geom) lon, ST_Y(geom) lat
            from businesses where name ilike '%' || $1 || '%' or postcode = upper($1)
            order by similarity(name, $1) desc limit $2
            """,
            q, limit,
        )
        out += [{"kind": "business", "id": r["business_id"], "label": r["name"], "sublabel": f"{r['sector']} · {r['address']}", "location": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}} for r in rows]
        rows = await c.fetch("select company_number, name, status from companies where name ilike '%' || $1 || '%' or company_number = upper($1) limit $2", q, limit)
        out += [{"kind": "company", "id": r["company_number"], "label": r["name"], "sublabel": f"{r['company_number']} · {r['status']}"} for r in rows]
        rows = await c.fetch(
            "select title_number, address, postcode, ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat from titles where title_number = upper($1) or address ilike '%' || $1 || '%' or postcode = upper($1) limit $2",
            q, limit,
        )
        out += [{"kind": "address", "id": r["title_number"], "label": r["address"], "sublabel": f"{r['postcode']} · {r['title_number']}", "location": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}} for r in rows]
    return out[:limit]


# ------------------------------------------------------------------ map layers
@app.get("/api/map/layers")
async def map_layers(req: Request, bbox: str = Query(..., description="west,south,east,north")):
    w, s, e, n = (float(x) for x in bbox.split(","))
    env = "ST_MakeEnvelope($1,$2,$3,$4,4326)"
    async with req.app.state.pool.acquire() as c:
        titles = await c.fetch(
            f"""
            select t.title_number, t.tenure, coalesce(p.category,'Other') category, b.sector,
                   coalesce(cardinality(b.distress_flags) > 0, false) distress, ST_AsGeoJSON(t.geom)::json geom
            from titles t
            left join lateral (select category from proprietors where title_number = t.title_number order by seq limit 1) p on true
            left join lateral (select sector, distress_flags from businesses where title_number = t.title_number limit 1) b on true
            where t.geom && {env} limit 5000
            """,
            w, s, e, n,
        )
        businesses = await c.fetch(f"select business_id, sector, name, cardinality(distress_flags) > 0 distress, ST_AsGeoJSON(geom)::json geom from businesses where geom && {env} limit 5000", w, s, e, n)
        planning = await c.fetch(f"select reference, status, type, ST_AsGeoJSON(geom)::json geom from planning_applications where geom && {env} limit 5000", w, s, e, n)
        traffic = await c.fetch(f"select count_point_id, aadf, year, method, ST_AsGeoJSON(geom)::json geom from traffic_counts where geom && {env}", w, s, e, n)
        footfall = await c.fetch(f"select h3, band, monthly_visits, ST_AsGeoJSON(geom)::json geom from footfall_cells where month = (select max(month) from footfall_cells) and geom && {env}", w, s, e, n)
        # Constraint polygons (flood zones, green belt) run to megabytes each: clip to the viewport and simplify to
        # roughly a pixel at the current width so a screen is tens of kB, not tens of MB.
        tol = max((e - w) / 2000.0, 1e-6)
        constraints = await c.fetch(
            f"select id, kind, name, ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_ClipByBox2D(geom, {env}), $5))::json geom from constraints where geom && {env} limit 5000", w, s, e, n, tol
        )

    def fc(rows, props):
        return {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": r["geom"], "properties": {k: r[v] for k, v in props.items()}} for r in rows]}

    return {
        "titles": fc(titles, {"titleNumber": "title_number", "tenure": "tenure", "category": "category", "sector": "sector", "distress": "distress"}),
        "businesses": fc(businesses, {"businessId": "business_id", "sector": "sector", "name": "name", "distress": "distress"}),
        "planning": fc(planning, {"reference": "reference", "status": "status", "type": "type"}),
        "traffic": fc(traffic, {"countPointId": "count_point_id", "aadf": "aadf", "year": "year", "method": "method"}),
        "footfall": fc(footfall, {"h3": "h3", "band": "band", "monthlyVisits": "monthly_visits"}),
        "constraints": fc(constraints, {"id": "id", "kind": "kind", "name": "name"}),
    }


# ------------------------------------------------------------------ titles
@app.get("/api/titles/at")
async def title_at(req: Request, lon: float, lat: float):
    async with req.app.state.pool.acquire() as c:
        r = await c.fetchrow("select title_number from titles where st_contains(geom, st_setsrid(st_makepoint($1, $2), 4326)) limit 1", lon, lat)
    if not r:
        raise HTTPException(404, "no registered title at this point")
    return await get_title(req, r["title_number"])


@app.get("/api/titles/{title_number}")
async def get_title(req: Request, title_number: str):
    async with req.app.state.pool.acquire() as c:
        t = await c.fetchrow("select *, ST_AsGeoJSON(geom)::json geojson from titles where title_number = $1", title_number)
        if not t:
            raise HTTPException(404)
        props = await c.fetch("select * from proprietors where title_number = $1 order by seq", title_number)
        leases = await c.fetch("select * from leases where freehold_title = $1", title_number)
        charges = await c.fetch("select lender, charge_date from title_charges where title_number = $1", title_number)
    return {
        **tag(t),
        "titleNumber": t["title_number"], "inspireId": t["inspire_id"], "tenure": t["tenure"], "address": t["address"], "postcode": t["postcode"],
        "uprn": str(t["uprn"]) if t["uprn"] else None, "geometry": t["geojson"], "areaSqm": float(t["area_sqm"] or 0),
        "proprietors": [{"name": "Private individual" if p["redacted"] and not t["register_purchased"] else p["name"], "category": p["category"], "companyNumber": p["company_number"], "address": p["address"], "redacted": p["redacted"] and not t["register_purchased"]} for p in props],
        "pricePaid": t["price_paid"], "pricePaidDate": t["price_paid_date"].isoformat() if t["price_paid_date"] else None,
        "dateProprietorAdded": t["date_proprietor_added"].isoformat() if t["date_proprietor_added"] else None,
        "leases": [lease_json(l) for l in leases],
        "registerPurchased": t["register_purchased"], "titlePlanPurchased": t["title_plan_purchased"],
        "charges": [{"lender": ch["lender"], "date": ch["charge_date"].isoformat()} for ch in charges],
    }


def lease_json(l: asyncpg.Record) -> dict[str, Any]:
    return {
        **tag(l), "leaseId": l["lease_id"], "freeholdTitleNumber": l["freehold_title"], "leaseholdTitleNumber": l["leasehold_title"],
        "dateOfLease": l["date_of_lease"].isoformat() if l["date_of_lease"] else None, "termYears": float(l["term_years"] or 0), "termDescription": l["term_description"],
        "expiryDate": l["expiry_date"].isoformat() if l["expiry_date"] else None, "premium": l["premium"], "lessee": l["lessee"], "alienationClause": l["alienation_clause"],
        "parsed": json.loads(l["parsed"]) if isinstance(l["parsed"], str) else l["parsed"],
    }


@app.get("/api/titles/{title_number}/leases")
async def title_leases(req: Request, title_number: str):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from leases where freehold_title = $1", title_number)
    return [lease_json(l) for l in rows]


@app.get("/api/titles/{title_number}/businesses")
async def title_businesses(req: Request, title_number: str):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select business_id from businesses where title_number = $1", title_number)
    return [await get_business(req, r["business_id"]) for r in rows]


@app.get("/api/businesses/{business_id}")
async def get_business(req: Request, business_id: str):
    async with req.app.state.pool.acquire() as c:
        b = await c.fetchrow("select *, ST_X(geom) lon, ST_Y(geom) lat from businesses where business_id = $1", business_id)
        if not b:
            raise HTTPException(404)
        regs = await c.fetch("select r.* from register_records r join business_registers br using (register, register_id) where br.business_id = $1", business_id)
    return {
        **tag(b), "businessId": b["business_id"], "name": b["name"], "sector": b["sector"], "subSector": b["sub_sector"], "address": b["address"], "postcode": b["postcode"],
        "uprn": str(b["uprn"]) if b["uprn"] else None, "location": {"type": "Point", "coordinates": [b["lon"], b["lat"]]}, "titleNumber": b["title_number"], "tenure": b["tenure"],
        "operatorCompanyNumber": b["operator_company_number"], "operatorName": b["operator_name"], "freeholderName": b["freeholder_name"], "freeholderCompanyNumber": b["freeholder_company_number"],
        "hereditamentUarn": b["hereditament_uarn"], "epcCertificateId": b["epc_certificate_id"], "fhrsRating": b["fhrs_rating"], "distressFlags": list(b["distress_flags"] or []),
        "registers": [{**tag(r), "register": r["register"], "registerId": r["register_id"], "name": r["name"], "providerName": r["provider_name"], "providerId": r["provider_id"], "status": r["status"],
                       "registeredAt": r["registered_at"].isoformat() if r["registered_at"] else None, "rating": r["rating"], "ratingDate": r["rating_date"].isoformat() if r["rating_date"] else None,
                       "capacity": r["capacity"], "capacityLabel": r["capacity_label"], "extra": json.loads(r["extra"]) if isinstance(r["extra"], str) else r["extra"]} for r in regs],
    }


# ------------------------------------------------------------ collected open data
def place_json(r) -> dict[str, Any]:
    return {
        "id": r["place_id"], "name": r["name"], "category": r["category"], "sector": r["sector"], "confidence": float(r["confidence"] or 0),
        "address": r["address"], "postcode": r["postcode"], "locality": r["locality"], "website": r["website"], "phone": r["phone"], "brand": r["brand"],
        "source": r["source"], "location": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
        **({"distanceM": round(r["distance_m"])} if "distance_m" in r.keys() else {}),
    }


def sale_json(r) -> dict[str, Any]:
    return {
        "id": r["transaction_id"], "price": r["price"], "date": r["sale_date"].isoformat(), "postcode": r["postcode"], "type": r["property_type"], "newBuild": r["new_build"],
        "tenure": r["tenure"], "address": r["address"], "locality": r["locality"], "town": r["town"], "district": r["district"], "category": r["ppd_category"],
        "lon": r["lon"], "lat": r["lat"], "geocode": r["geocode"],
        **({"distanceM": round(r["distance_m"])} if "distance_m" in r.keys() else {}),
    }


@app.get("/api/places")
async def places_near(req: Request, lon: float, lat: float, radius: float = 1000, sector: str | None = None, limit: int = 500):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(
            """
            select *, ST_X(geom) lon, ST_Y(geom) lat, ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) distance_m
            from places
            where ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) and ($4::text is null or sector = $4)
            order by distance_m limit $5
            """,
            lon, lat, radius, sector, limit,
        )
    return [place_json(r) for r in rows]


@app.get("/api/places/{place_id}")
async def get_place(req: Request, place_id: str):
    async with req.app.state.pool.acquire() as c:
        r = await c.fetchrow("select *, ST_X(geom) lon, ST_Y(geom) lat from places where place_id = $1", place_id)
    if not r:
        raise HTTPException(404)
    return place_json(r)


@app.get("/api/price-paid")
async def price_paid_near(req: Request, lon: float, lat: float, radius: float = 500, type: str | None = None, limit: int = 50):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(
            """
            select *, ST_X(geom) lon, ST_Y(geom) lat, ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) distance_m
            from price_paid
            where geom is not null and ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3) and ($4::text is null or property_type = $4)
            order by distance_m, sale_date desc limit $5
            """,
            lon, lat, radius, type, limit,
        )
    return [sale_json(r) for r in rows]


@app.get("/api/price-paid/{transaction_id}")
async def get_price_paid(req: Request, transaction_id: str):
    async with req.app.state.pool.acquire() as c:
        r = await c.fetchrow("select *, ST_X(geom) lon, ST_Y(geom) lat from price_paid where transaction_id = $1", transaction_id)
    if not r:
        raise HTTPException(404)
    return sale_json(r)


@app.get("/api/traffic")
async def traffic_near(req: Request, lon: float, lat: float, radius: float = 1000, limit: int = 50):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch(
            """
            select *, ST_X(geom) lon, ST_Y(geom) lat, ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint($1,$2),4326)) distance_m
            from traffic_counts where ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
            order by distance_m limit $4
            """,
            lon, lat, radius, limit,
        )
    return [
        {**tag(r), "countPointId": r["count_point_id"], "roadName": r["road_name"], "roadType": r["road_type"], "location": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
         "year": r["year"], "method": r["method"], "aadf": r["aadf"], "cars": r["cars"], "lgv": r["lgv"], "hgv": r["hgv"], "pedalCycles": r["pedal_cycles"],
         "history": json.loads(r["history"]) if isinstance(r["history"], str) else r["history"], "distanceM": round(r["distance_m"])}
        for r in rows
    ]


@app.get("/api/map/open-data")
async def map_open_data(req: Request, bbox: str = Query(..., description="west,south,east,north"), buildings: bool = False):
    """Real layers for the viewport: places, price paid (non-residential) and optionally buildings."""
    w, s, e, n = (float(x) for x in bbox.split(","))
    env = "ST_MakeEnvelope($1,$2,$3,$4,4326)"
    async with req.app.state.pool.acquire() as c:
        places = await c.fetch(f"select place_id, name, category, sector, confidence, postcode, ST_AsGeoJSON(geom)::json geom from places where geom && {env} limit 5000", w, s, e, n)
        sales = await c.fetch(f"select transaction_id, price, sale_date, property_type, address, postcode, geocode, ST_AsGeoJSON(geom)::json geom from price_paid where geom && {env} order by sale_date desc limit 5000", w, s, e, n)
        blds = await c.fetch(f"select building_id, class, height_m, levels, ST_AsGeoJSON(geom)::json geom from buildings where geom && {env} limit 20000", w, s, e, n) if buildings else []

    def fc(rows, props):
        return {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": r["geom"], "properties": {k: (r[v].isoformat() if hasattr(r[v], "isoformat") else r[v]) for k, v in props.items()}} for r in rows]}

    out = {
        "poi": fc(places, {"id": "place_id", "name": "name", "category": "category", "sector": "sector", "confidence": "confidence", "postcode": "postcode"}),
        "pricePaid": fc(sales, {"id": "transaction_id", "price": "price", "date": "sale_date", "type": "property_type", "address": "address", "postcode": "postcode", "geocode": "geocode"}),
    }
    if buildings:
        out["buildings"] = fc(blds, {"id": "building_id", "class": "class", "height": "height_m", "levels": "levels"})
    return out


@app.get("/api/admin/sources")
async def admin_sources(req: Request, user: User = Depends(require_role("admin"))):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from data_sources order by name")
    return [{"id": r["id"], "name": r["name"], "provider": r["provider"], "licence": r["licence"], "cadence": r["cadence"], "lastRun": r["last_run"].isoformat() if r["last_run"] else None,
             "nextRun": r["next_run"].isoformat() if r["next_run"] else None, "status": r["status"], "records": r["records"], "note": r["note"], "docsUrl": r["docs_url"]} for r in rows]


# ------------------------------------------------------------ users, watchlists, audit
@app.get("/api/me")
async def me(user: User = Depends(current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "roles": user.roles}


@app.get("/api/me/watchlist")
async def get_watchlist(req: Request, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from watch_items where user_id = $1 order by added_at desc", user.id)
    return [{"id": str(r["id"]), "entityType": r["entity_type"], "entityId": r["entity_id"], "label": r["label"], "notes": r["notes"], "radiusM": r["radius_m"], "project": r["project"], "addedAt": r["added_at"].isoformat(), **(json.loads(r["extra"]) if r.keys().__contains__("extra") and r["extra"] else {})} for r in rows]


@app.post("/api/me/watchlist")
async def save_watchlist(req: Request, items: list[dict[str, Any]], user: User = Depends(current_user)):
    """Replace the caller's watchlist (the UI is the source of truth for ordering and pipeline fields)."""
    async with req.app.state.pool.acquire() as c:
        async with c.transaction():
            await c.execute("insert into users (user_id, email) values ($1, $2) on conflict (user_id) do update set email = excluded.email", user.id, user.email)
            await c.execute("delete from watch_items where user_id = $1", user.id)
            for w in items:
                extra = {k: v for k, v in w.items() if k not in ("id", "entityType", "entityId", "label", "notes", "radiusM", "project", "addedAt")}
                await c.execute(
                    "insert into watch_items (user_id, entity_type, entity_id, label, notes, radius_m, project, added_at, extra) values ($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz, now()),$9::jsonb) on conflict (user_id, entity_type, entity_id) do nothing",
                    user.id, w.get("entityType"), w.get("entityId"), w.get("label"), w.get("notes"), w.get("radiusM"), w.get("project"), client_ts(w.get("addedAt")), json.dumps(extra),
                )
    return {"ok": True, "count": len(items)}


@app.post("/api/audit")
async def record_audit(req: Request, e: dict[str, Any], user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        await c.execute(
            "insert into audit_log (event_id, at, user_id, user_name, kind, summary, entity_type, entity_id, licences, count) values ($1, coalesce($2::timestamptz, now()), $3, $4, $5, $6, $7, $8, $9, $10) on conflict (event_id) do nothing",
            e.get("id"), client_ts(e.get("at")), user.id, user.name, e.get("kind"), e.get("summary"), e.get("entityType"), e.get("entityId"), e.get("licences") or [], e.get("count"),
        )
    return {"ok": True}


@app.get("/api/audit")
async def list_audit(req: Request, limit: int = 500, user: User = Depends(require_role("compliance"))):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from audit_log order by at desc limit $1", limit)
    return [{"id": r["event_id"], "at": r["at"].isoformat(), "userId": r["user_id"], "userName": r["user_name"], "kind": r["kind"], "summary": r["summary"], "entityType": r["entity_type"], "entityId": r["entity_id"], "licences": list(r["licences"] or []), "count": r["count"]} for r in rows]


# ------------------------------------------------------------ local accounts (email + password, admin-managed)
from . import accounts as _acct  # noqa: E402


def _acct_out(r) -> dict[str, Any]:
    return {"id": r["user_id"], "email": r["email"], "name": r["name"], "roles": list(r["roles"]), "office": r["office"], "mustReset": r["must_reset"], "disabled": r["disabled"], "createdAt": r["created_at"].isoformat() if r.get("created_at") else None, "lastLoginAt": r["last_login_at"].isoformat() if r.get("last_login_at") else None}


@app.get("/api/auth/mode")
async def auth_mode():
    from . import auth as _auth

    return {"mode": "oidc" if _auth.CONFIGURED else "local" if _acct.ENABLED else "demo"}


@app.post("/api/auth/login")
async def login(req: Request, body: dict[str, Any]):
    if not _acct.ENABLED:
        raise HTTPException(404, "local sign-in is not enabled")
    email, password = str(body.get("email", "")).strip(), str(body.get("password", ""))
    if not email or not password:
        raise HTTPException(400, "email and password required")
    async with req.app.state.pool.acquire() as c:
        row = await _acct.authenticate(c, email, password)
        if not row:
            await c.execute("insert into audit_log (event_id, user_id, user_name, kind, summary) values ($1, $2, $3, 'sign-in', $4)", f"L{os.urandom(6).hex()}", email.lower(), email, "Failed sign-in")
            raise HTTPException(401, "email or password not recognised")
        await c.execute("insert into audit_log (event_id, user_id, user_name, kind, summary) values ($1, $2, $3, 'sign-in', 'Signed in')", f"L{os.urandom(6).hex()}", row["user_id"], row["name"])
    return {"token": _acct.issue_token(dict(row)), "user": _acct_out(dict(row))}


@app.post("/api/auth/password")
async def change_password(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    current, new = str(body.get("current", "")), str(body.get("new", ""))
    if len(new) < 10:
        raise HTTPException(400, "new password must be at least 10 characters")
    async with req.app.state.pool.acquire() as c:
        row = await c.fetchrow("select * from accounts where user_id = $1", user.id)
        if not row or not _acct.verify_password(current, row["password_hash"]):
            raise HTTPException(401, "current password not recognised")
        await c.execute("update accounts set password_hash = $2, must_reset = false, token_version = token_version + 1 where user_id = $1", user.id, _acct.hash_password(new))
        fresh = await c.fetchrow("select * from accounts where user_id = $1", user.id)
    return {"ok": True, "token": _acct.issue_token(dict(fresh))}


@app.get("/api/admin/users")
async def list_users(req: Request, user: User = Depends(require_role("admin"))):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from accounts order by created_at")
    return [_acct_out(dict(r)) for r in rows]


@app.post("/api/admin/users")
async def create_user(req: Request, body: dict[str, Any], user: User = Depends(require_role("admin"))):
    email, name = str(body.get("email", "")).strip().lower(), str(body.get("name", "")).strip()
    if "@" not in email or not name:
        raise HTTPException(400, "name and a valid email are required")
    async with req.app.state.pool.acquire() as c:
        if await _acct.get_by_email(c, email):
            raise HTTPException(409, "an account with that email already exists")
        acct, pw = await _acct.create_account(c, email=email, name=name, roles=body.get("roles"), office=body.get("office"), created_by=user.id)
        await c.execute("insert into audit_log (event_id, user_id, user_name, kind, summary, entity_type, entity_id) values ($1, $2, $3, 'settings-changed', $4, 'account', $5)", f"L{os.urandom(6).hex()}", user.id, user.name, f"Created account for {email} ({', '.join(acct['roles'])})", acct["user_id"])
    return {"user": {**acct, "id": acct["user_id"], "mustReset": True}, "temporaryPassword": pw}


@app.post("/api/admin/users/{user_id}/reset")
async def reset_user(req: Request, user_id: str, user: User = Depends(require_role("admin"))):
    pw = _acct.temp_password()
    async with req.app.state.pool.acquire() as c:
        n = await c.execute("update accounts set password_hash = $2, must_reset = true, token_version = token_version + 1 where user_id = $1", user_id, _acct.hash_password(pw))
        await c.execute("insert into audit_log (event_id, user_id, user_name, kind, summary, entity_type, entity_id) values ($1, $2, $3, 'settings-changed', 'Reset a password', 'account', $4)", f"L{os.urandom(6).hex()}", user.id, user.name, user_id)
    return {"ok": True, "updated": n, "temporaryPassword": pw}


@app.post("/api/admin/users/{user_id}/disabled")
async def set_disabled(req: Request, user_id: str, body: dict[str, Any], user: User = Depends(require_role("admin"))):
    if user_id == user.id:
        raise HTTPException(400, "you cannot disable your own account")
    async with req.app.state.pool.acquire() as c:
        await c.execute("update accounts set disabled = $2, token_version = token_version + 1 where user_id = $1", user_id, bool(body.get("disabled", True)))
        await c.execute("insert into audit_log (event_id, user_id, user_name, kind, summary, entity_type, entity_id) values ($1, $2, $3, 'settings-changed', $4, 'account', $5)", f"L{os.urandom(6).hex()}", user.id, user.name, "Disabled an account" if body.get("disabled", True) else "Re-enabled an account", user_id)
    return {"ok": True}


@app.put("/api/admin/users/{user_id}")
async def update_user(req: Request, user_id: str, body: dict[str, Any], user: User = Depends(require_role("admin"))):
    async with req.app.state.pool.acquire() as c:
        await c.execute("update accounts set name = coalesce($2, name), roles = coalesce($3, roles), office = coalesce($4, office), token_version = token_version + 1 where user_id = $1", user_id, body.get("name"), _acct.clean_roles(body["roles"]) if body.get("roles") is not None else None, body.get("office"))
    return {"ok": True}


# ------------------------------------------------------------ assistant (Claude relay; tools run in the browser)
@app.post("/api/assistant")
async def assistant(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    from . import assistant as asst

    if not asst.configured():
        raise HTTPException(503, "assistant not configured: set ANTHROPIC_API_KEY on the API")
    messages = body.get("messages") or []
    if not isinstance(messages, list) or not messages:
        raise HTTPException(400, "messages required")
    tools = body.get("tools") or []
    try:
        out = await asst.complete(messages, tools, body.get("context"), user_name=user.name)
    except RuntimeError as e:
        raise HTTPException(502, str(e)) from e
    async with req.app.state.pool.acquire() as c:
        await c.execute("insert into audit_log (event_id, user_id, user_name, kind, summary, entity_type, count) values ($1,$2,$3,'assistant',$4,'assistant',$5) on conflict do nothing",
                        f"AS{os.urandom(6).hex()}", user.id, user.name, (messages[-1].get("content") if isinstance(messages[-1].get("content"), str) else "tool results")[:200], len(messages))
    return out


# ------------------------------------------------------------ alerts: rules, channels, deliveries, staff
def _rule_out(r: asyncpg.Record) -> dict[str, Any]:
    body = json.loads(r["body"]) if isinstance(r["body"], str) else dict(r["body"])
    body.update({"id": r["rule_id"], "name": r["name"], "enabled": r["enabled"], "createdBy": r["user_id"], "createdAt": r["created_at"].isoformat(), "updatedAt": r["updated_at"].isoformat(), "lastFiredAt": r["last_fired_at"].isoformat() if r["last_fired_at"] else None, "firedCount": r["fired_count"]})
    return body


@app.get("/api/alerts/rules")
async def list_rules(req: Request, user: User = Depends(current_user)):
    """Rules I own plus rules a colleague added me to (read-only for me)."""
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from alert_rules where user_id = $1 or body->'recipients' @> $2::jsonb order by updated_at desc", user.id, json.dumps([{"staffId": user.id}]))
    return [_rule_out(r) for r in rows]


@app.put("/api/alerts/rules/{rule_id}")
async def save_rule(req: Request, rule_id: str, rule: dict[str, Any], user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        owner = await c.fetchval("select user_id from alert_rules where rule_id = $1", rule_id)
        if owner and owner != user.id and not user.has("admin"):
            raise HTTPException(403, "only the owner can change this alert")
        await c.execute("insert into users (user_id, email) values ($1, $2) on conflict (user_id) do nothing", user.id, user.email)
        await c.execute(
            "insert into alert_rules (rule_id, user_id, name, enabled, body) values ($1,$2,$3,$4,$5::jsonb) on conflict (rule_id) do update set name = excluded.name, enabled = excluded.enabled, body = excluded.body, updated_at = now()",
            rule_id, owner or user.id, rule.get("name") or "Untitled alert", bool(rule.get("enabled", True)), json.dumps({k: v for k, v in rule.items() if k not in ("id", "createdBy", "createdAt", "updatedAt", "lastFiredAt", "firedCount")}),
        )
    return {"ok": True, "id": rule_id}


@app.delete("/api/alerts/rules/{rule_id}")
async def delete_rule(req: Request, rule_id: str, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        n = await c.execute("delete from alert_rules where rule_id = $1 and (user_id = $2 or $3)", rule_id, user.id, user.has("admin"))
    return {"ok": True, "deleted": n}


@app.post("/api/alerts/rules/{rule_id}/test")
async def test_rule(req: Request, rule_id: str, body: dict[str, Any], user: User = Depends(current_user)):
    """Dry run: which of the recent alerts would this rule (as posted, unsaved) match, and why."""
    from alerts.matcher import Context, match_rule

    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from alerts where occurred_at > now() - interval '40 days' order by occurred_at desc limit 500")
    out = []
    for a in rows:
        al = {"alertId": str(a["alert_id"]), "kind": a["kind"], "title": a["title"], "detail": a["detail"], "occurredAt": a["occurred_at"].isoformat(), "severity": a["severity"], "entityType": a["entity_type"], "entityId": a["entity_id"], "sector": a["sector"],
              "businessId": a.get("business_id") if hasattr(a, "get") else a["business_id"], "titleNumber": a["title_number"], "postcode": a["postcode"], "location": [a["lon"], a["lat"]] if a["lon"] is not None else None}
        m = match_rule({**body, "enabled": True}, al, Context(deal_score=a["deal_score"]))
        out.append({"alertId": al["alertId"], "title": al["title"], "match": m.match, "reasons": m.reasons})
    return {"matched": sum(1 for o in out if o["match"]), "total": len(out), "results": out}


@app.get("/api/me/notifications")
async def get_notifications(req: Request, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        r = await c.fetchrow("select * from notification_prefs where user_id = $1", user.id)
    if not r:
        return {"email": user.email or "", "emailVerified": False, "mobile": "", "mobileVerified": False, "teamsWebhook": "", "quietHours": {"enabled": True, "from": "21:00", "to": "07:00"}, "digestHour": 8, "weeklyDay": 1, "timezone": "Europe/London"}
    return {"email": r["email"], "emailVerified": r["email_verified"], "mobile": r["mobile"], "mobileVerified": r["mobile_verified"], "teamsWebhook": r["teams_webhook"], "quietHours": {"enabled": r["quiet_enabled"], "from": r["quiet_from"], "to": r["quiet_to"]}, "digestHour": r["digest_hour"], "weeklyDay": r["weekly_day"], "timezone": r["timezone"]}


@app.put("/api/me/notifications")
async def save_notifications(req: Request, p: dict[str, Any], user: User = Depends(current_user)):
    """Save channel details. Changing the address or number clears its verified flag."""
    qh = p.get("quietHours") or {}
    async with req.app.state.pool.acquire() as c:
        cur = await c.fetchrow("select email, mobile, email_verified, mobile_verified from notification_prefs where user_id = $1", user.id)
        email_ok = bool(cur and cur["email"] == p.get("email", "") and cur["email_verified"])
        mobile_ok = bool(cur and cur["mobile"] == p.get("mobile", "") and cur["mobile_verified"])
        await c.execute("insert into users (user_id, email) values ($1, $2) on conflict (user_id) do nothing", user.id, user.email)
        await c.execute(
            "insert into notification_prefs (user_id, email, email_verified, mobile, mobile_verified, teams_webhook, quiet_enabled, quiet_from, quiet_to, digest_hour, weekly_day, timezone) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) "
            "on conflict (user_id) do update set email = excluded.email, email_verified = excluded.email_verified, mobile = excluded.mobile, mobile_verified = excluded.mobile_verified, teams_webhook = excluded.teams_webhook, quiet_enabled = excluded.quiet_enabled, quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, digest_hour = excluded.digest_hour, weekly_day = excluded.weekly_day, timezone = excluded.timezone",
            user.id, p.get("email", ""), email_ok, p.get("mobile", ""), mobile_ok, p.get("teamsWebhook", ""), bool(qh.get("enabled", True)), qh.get("from", "21:00"), qh.get("to", "07:00"), int(p.get("digestHour", 8)), int(p.get("weeklyDay", 1)), p.get("timezone", "Europe/London"),
        )
    return {"ok": True, "emailVerified": email_ok, "mobileVerified": mobile_ok}


@app.post("/api/me/notifications/verify")
async def start_verification(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    """Send a six-digit code over the channel being verified (email or sms)."""
    import secrets

    from alerts.senders import send_email, send_sms

    channel = body.get("channel")
    if channel not in ("email", "sms"):
        raise HTTPException(400, "channel must be email or sms")
    code = f"{secrets.randbelow(1_000_000):06d}"
    async with req.app.state.pool.acquire() as c:
        r = await c.fetchrow("select email, mobile from notification_prefs where user_id = $1", user.id)
        if not r:
            raise HTTPException(400, "save your channel details first")
        to = r["email"] if channel == "email" else r["mobile"]
        if not to:
            raise HTTPException(400, f"no {channel} address saved")
        status, note = send_email(to, "Your Property Intelligence verification code", f"Your code is {code}. It expires in 15 minutes.") if channel == "email" else send_sms(to, f"Property Intelligence code: {code}")
        await c.execute("update notification_prefs set pending_code = $2, pending_channel = $3 where user_id = $1", user.id, code, channel)
    return {"ok": status in ("sent", "simulated"), "status": status, "note": note}


@app.post("/api/me/notifications/confirm")
async def confirm_verification(req: Request, body: dict[str, Any], user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        r = await c.fetchrow("select pending_code, pending_channel from notification_prefs where user_id = $1", user.id)
        if not r or not r["pending_code"] or r["pending_code"] != str(body.get("code", "")).strip():
            raise HTTPException(400, "code does not match")
        col = "email_verified" if r["pending_channel"] == "email" else "mobile_verified"
        await c.execute(f"update notification_prefs set {col} = true, pending_code = null, pending_channel = null where user_id = $1", user.id)
    return {"ok": True, "channel": r["pending_channel"]}


@app.get("/api/alerts/deliveries")
async def list_deliveries(req: Request, limit: int = 500, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select d.*, r.name as rule_name from alert_deliveries d left join alert_rules r on r.rule_id = d.rule_id where d.user_id = $1 or $2 order by d.at desc limit $3", user.id, user.has("compliance"), limit)
    return [{"id": str(r["id"]), "at": r["at"].isoformat(), "ruleId": r["rule_id"], "ruleName": r["rule_name"], "channel": r["channel"], "to": r["to_addr"], "toName": r["to_name"], "alertIds": list(r["alert_ids"] or []), "subject": r["subject"], "body": r["body"], "status": r["status"], "note": r["note"]} for r in rows]


@app.get("/api/alerts/state")
async def get_alert_state(req: Request, user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from alert_state where user_id = $1", user.id)
    return {r["alert_id"]: {"read": r["read"], "snoozedUntil": r["snoozed_until"].isoformat() if r["snoozed_until"] else None, "assignedTo": r["assigned_to"], "notes": r["notes"], "dismissed": r["dismissed"]} for r in rows}


@app.put("/api/alerts/state/{alert_id}")
async def put_alert_state(req: Request, alert_id: str, s: dict[str, Any], user: User = Depends(current_user)):
    async with req.app.state.pool.acquire() as c:
        await c.execute(
            "insert into alert_state (user_id, alert_id, read, snoozed_until, assigned_to, notes, dismissed) values ($1,$2,$3,$4::timestamptz,$5,$6,$7) on conflict (user_id, alert_id) do update set read = excluded.read, snoozed_until = excluded.snoozed_until, assigned_to = excluded.assigned_to, notes = excluded.notes, dismissed = excluded.dismissed",
            user.id, alert_id, bool(s.get("read", False)), s.get("snoozedUntil"), s.get("assignedTo"), s.get("notes"), bool(s.get("dismissed", False)),
        )
    return {"ok": True}


@app.get("/api/staff")
async def list_staff(req: Request, user: User = Depends(current_user)):
    """Colleagues who can be added to an alert. Synced from the identity provider."""
    async with req.app.state.pool.acquire() as c:
        rows = await c.fetch("select * from staff order by name")
    return [{"id": r["id"], "name": r["name"], "email": r["email"], "mobile": r["mobile"], "office": r["office"], "team": r["team"], "role": r["role"]} for r in rows]


# ------------------------------------------------------------ remaining endpoints
# These follow the same pattern; wire them as the ingestion jobs land.
for path in [
    "/api/titles/{title_number}/voa", "/api/titles/{title_number}/epc", "/api/titles/{title_number}/planning", "/api/titles/{title_number}/constraints",
    "/api/companies/{company_number}", "/api/companies/{company_number}/group", "/api/companies/{company_number}/titles", "/api/companies/{company_number}/businesses",
    "/api/voa/{uarn}", "/api/epc/{certificate_id}", "/api/planning/{reference:path}", "/api/footfall", "/api/alerts", "/api/documents/orders",
]:
    app.add_api_route(path, (lambda p: (lambda: not_implemented(p)))(path), methods=["GET"])

for path in ["/api/sourcing/businesses", "/api/sourcing/titles", "/api/alerts/{alert_id}/read", "/api/documents/orders", "/api/crm/match", "/api/crm/duplicates"]:
    app.add_api_route(path, (lambda p: (lambda: not_implemented(p)))(path), methods=["POST"])


@app.get("/api/crm/sample.csv", response_class=PlainTextResponse)
async def crm_sample():
    return "recordId,office,businessName,address,postcode\n"
