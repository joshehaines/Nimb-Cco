"""PlanIt aggregator.

Source: https://www.planit.org.uk/api/applics/json
Cadence: daily
Notes: Aggregated council planning applications for the authorities whose titles are loaded; filtered by
authority and start date, paged with a polite delay and a contact in the User-Agent. Coventry,
Stratford-on-Avon, Nuneaton and Bedworth and North Somerset were not on PlanIt when this was written;
add them to AREAS when they appear (check the area_name a bounding-box query returns).
"""
from __future__ import annotations

import json
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Iterator

import httpx

from .base import USER_AGENT, writable_dir
from .parsers._util import norm_postcode, parse_date

SOURCE_URL = "https://www.planit.org.uk/api/applics/json"
CADENCE = "daily"
LICENCE = "OGL"
AREAS = ["Warwick", "Bristol", "Birmingham", "Solihull", "Rugby", "North Warwickshire", "South Gloucestershire", "Bath"]
PAGE_SIZE = 200
MAX_PAGES = 50
PAUSE_S = 1.5
FIRST_RUN_DAYS = 365


def _state_path(workdir: Path) -> Path:
    return workdir / "planning_planit" / "last_run.txt"


def fetch(workdir: Path) -> list[Path]:
    workdir = writable_dir(workdir, "planning_planit")
    out = workdir / "planning_planit"
    out.mkdir(parents=True, exist_ok=True)
    state = _state_path(workdir)
    since = date.today() - timedelta(days=FIRST_RUN_DAYS)
    if state.exists():
        try:
            since = date.fromisoformat(state.read_text().strip()) - timedelta(days=7)   # catch late decisions
        except ValueError:
            pass
    today = date.today()
    paths: list[Path] = []
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=90, follow_redirects=True) as client:
        for area in AREAS:
            records: list[dict] = []
            for page in range(MAX_PAGES):
                r = client.get(SOURCE_URL, params={"auth": area, "start_date": since.isoformat(), "end_date": today.isoformat(), "pg_sz": PAGE_SIZE, "index": page * PAGE_SIZE})
                r.raise_for_status()
                body = r.json()
                batch = body.get("records") or []
                records.extend(batch)
                total = body.get("total") or 0
                if len(batch) < PAGE_SIZE or (page + 1) * PAGE_SIZE >= total:
                    break
                time.sleep(PAUSE_S)
            target = out / f"{area.replace(' ', '_').lower()}_{today.isoformat()}.json"
            target.write_text(json.dumps({"area": area, "since": since.isoformat(), "records": records}))
            paths.append(target)
            time.sleep(PAUSE_S)
    state.write_text(today.isoformat())
    return paths


def parse(data) -> Iterator[dict]:
    obj = json.loads(data.read_text() if isinstance(data, Path) else data) if not isinstance(data, dict) else data
    for r in obj.get("records") or []:
        ref = r.get("reference") or r.get("uid") or r.get("name")
        auth = r.get("area_name")
        if not ref or not auth:
            continue
        o = r.get("other_fields") or {}
        loc = r.get("location") or {}
        coords = loc.get("coordinates") if isinstance(loc, dict) else None
        lon = coords[0] if coords and len(coords) == 2 else r.get("location_x")
        lat = coords[1] if coords and len(coords) == 2 else r.get("location_y")
        yield {
            "reference": str(ref),
            "authority": auth,
            "address": r.get("address"),
            "postcode": norm_postcode(r.get("postcode") or o.get("postcode")),
            "lon": float(lon) if lon is not None else None,
            "lat": float(lat) if lat is not None else None,
            "description": r.get("description"),
            "applicant": o.get("applicant_name") if (o.get("applicant_name") or "").lower() != "see source" else None,
            "agent": o.get("agent_company") or (o.get("agent_name") if (o.get("agent_name") or "").lower() != "see source" else None),
            "type": o.get("application_type") or r.get("app_type"),
            "status": o.get("status") or r.get("app_state"),
            "received_date": parse_date(o.get("date_received") or r.get("start_date")),
            "decision_date": parse_date(r.get("decided_date")),
            "portal_url": o.get("source_url") if (o.get("source_url") or "").startswith("http") and "search.do" not in (o.get("source_url") or "") else (r.get("url") or r.get("link")),
            "summary": f"{r.get('app_type') or ''} / {r.get('app_size') or ''} / {r.get('app_state') or ''}".strip(" /"),
        }


UPSERT = """insert into planning_applications (reference, authority, address, postcode, geom, description, applicant, agent, type, status, received_date, decision_date, portal_url, summary, source, licence)
    values ($1, $2, $3, $4, case when $5::float8 is null then null else ST_SetSRID(ST_MakePoint($5, $6), 4326) end, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PlanIt', 'OGL')
    on conflict (authority, reference) do update set address = excluded.address, postcode = excluded.postcode, geom = coalesce(excluded.geom, planning_applications.geom),
        description = excluded.description, applicant = coalesce(excluded.applicant, planning_applications.applicant), agent = coalesce(excluded.agent, planning_applications.agent),
        type = excluded.type, status = excluded.status, received_date = coalesce(excluded.received_date, planning_applications.received_date),
        decision_date = excluded.decision_date, portal_url = excluded.portal_url, summary = excluded.summary, fetched_at = now()"""


async def load(conn, path: Path) -> int:
    from ._upsert import Batcher

    b = Batcher(conn, UPSERT, size=500)
    seen: set[tuple[str, str]] = set()
    for rec in parse(path):
        key = (rec["authority"], rec["reference"])
        if key in seen:
            await b.flush()
            seen.clear()
        seen.add(key)
        await b.add(rec["reference"], rec["authority"], rec["address"], rec["postcode"], rec["lon"], rec["lat"], rec["description"], rec["applicant"], rec["agent"],
                    rec["type"], rec["status"], rec["received_date"], rec["decision_date"], rec["portal_url"], rec["summary"])
    await b.flush()
    return b.count


def diff(conn) -> int:
    return 0
