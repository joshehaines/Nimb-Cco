"""The Gazette insolvency notices.

Source: https://www.thegazette.co.uk/insolvency/notice/data.feed
Cadence: daily
Notes: The public JSON search feed, filtered to the corporate insolvency notice codes 2400 to 2499
(winding-up petitions and orders, administrations, liquidator appointments, creditors' meetings), paged
with a polite delay. Each notice carries the company name, category, publication time and a point; the
feed does not carry the company number, so notices are matched to Companies House by normalised name.
Matches append to companies.gazette_notices and raise a 'Gazette notice' alert; the linkage job then
flags the operator's businesses. The bulk data service is paid and not used.
"""
from __future__ import annotations

import json
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

import httpx

from .base import USER_AGENT, writable_dir
from ._upsert import norm_company_sql

SOURCE_URL = "https://www.thegazette.co.uk/insolvency/notice/data.json"
CADENCE = "daily"
LICENCE = "OGL"
NOTICE_CODES = ",".join(str(c) for c in range(2400, 2500))
PAGE_SIZE = 100
MAX_PAGES = 40            # 4,000 notices per run; a normal day is a few hundred
PAUSE_S = 1.0
FIRST_RUN_DAYS = 7
CRITICAL = {"2450", "2451", "2452", "2453", "2454", "2410", "2411", "2412", "2413"}   # petitions, orders, administration


def _state_path(workdir: Path) -> Path:
    return workdir / "gazette" / "last_run.txt"


def fetch(workdir: Path) -> Path:
    """Page the feed from the last run date (minus one day for late publication) to today."""
    workdir = writable_dir(workdir, "gazette")
    out = workdir / "gazette"
    out.mkdir(parents=True, exist_ok=True)
    state = _state_path(workdir)
    since = date.today() - timedelta(days=FIRST_RUN_DAYS)
    if state.exists():
        try:
            since = date.fromisoformat(state.read_text().strip()) - timedelta(days=1)
        except ValueError:
            pass
    today = date.today()
    entries: list[dict] = []
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True) as client:
        for page in range(1, MAX_PAGES + 1):
            r = client.get(SOURCE_URL, params={"results-page-size": PAGE_SIZE, "results-page": page, "noticetypes": NOTICE_CODES,
                                                "start-publish-date": since.isoformat(), "end-publish-date": today.isoformat()})
            r.raise_for_status()
            body = r.json()
            batch = body.get("entry") or []
            if isinstance(batch, dict):
                batch = [batch]
            entries.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
            time.sleep(PAUSE_S)
    target = out / f"notices_{today.isoformat()}.json"
    target.write_text(json.dumps({"since": since.isoformat(), "until": today.isoformat(), "entry": entries}))
    state.write_text(today.isoformat())
    return target


def parse(data) -> Iterator[dict]:
    """Normalised notices from a saved feed page (or several concatenated)."""
    obj = json.loads(data.read_text() if isinstance(data, Path) else data) if not isinstance(data, dict) else data
    for e in obj.get("entry") or []:
        nid = str(e.get("id") or "").rstrip("/").rsplit("/", 1)[-1]
        if not nid:
            continue
        links = e.get("link") or []
        if isinstance(links, dict):
            links = [links]
        link = next((l.get("@href") for l in links if l.get("@href") and "@rel" not in l), None) or f"https://www.thegazette.co.uk/notice/{nid}"
        pt = e.get("geo:Point") or {}
        published = e.get("published") or e.get("updated")
        try:
            published_at = datetime.fromisoformat(published.replace("Z", "+00:00")) if published else None
            if published_at and published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
        except ValueError:
            published_at = None
        snippet = e.get("content") or ""
        if isinstance(snippet, dict):
            snippet = snippet.get("#text") or ""
        yield {
            "notice_id": nid,
            "notice_code": str(e.get("f:notice-code") or ""),
            "category": (e.get("category") or {}).get("@term") if isinstance(e.get("category"), dict) else None,
            "company_name": (e.get("title") or "").strip() or None,
            "published": published_at,
            "lat": float(pt["geo:lat"]) if pt.get("geo:lat") else None,
            "lon": float(pt["geo:long"]) if pt.get("geo:long") else None,
            "link": link,
            "snippet": snippet[:600],
        }


CREATE = """create table if not exists gazette_notices (
  notice_id      text primary key,
  notice_code    text,
  category       text,
  company_name   text,
  company_number text references companies,
  published      timestamptz,
  lat            double precision,
  lon            double precision,
  link           text,
  snippet        text,
  fetched_at     timestamptz not null default now()
)"""

INSERT = """insert into gazette_notices (notice_id, notice_code, category, company_name, company_number, published, lat, lon, link, snippet)
    values ($1, $2, $3, $4, (select company_number from companies c where """ + norm_company_sql("c.name") + """ = """ + norm_company_sql("$4::text") + """
                              order by (c.status ilike 'active%') desc, c.incorporated desc nulls last limit 1), $5, $6, $7, $8, $9)
    on conflict (notice_id) do nothing
    returning notice_id, company_number, company_name, notice_code, category, published, lat, lon, link"""

APPEND = """update companies set gazette_notices = gazette_notices || $2::jsonb where company_number = $1
    and not (gazette_notices @> $3::jsonb)"""

ALERT = """insert into alerts (user_id, kind, title, detail, occurred_at, severity, entity_type, entity_id, sector, lon, lat)
    values (null, 'Gazette notice', $1, $2, $3, $4, 'company', $5,
            (select sector from businesses where operator_company_number = $5 limit 1), $6, $7)"""


async def load(conn, path: Path) -> int:
    await conn.execute(CREATE)
    written = 0
    for n in parse(path):
        if not n["company_name"] or len(n["company_name"]) < 3:
            continue
        row = await conn.fetchrow(INSERT, n["notice_id"], n["notice_code"], n["category"], n["company_name"], n["published"], n["lat"], n["lon"], n["link"], n["snippet"])
        if not row:
            continue
        written += 1
        if row["company_number"]:
            item = {"noticeId": row["notice_id"], "code": row["notice_code"], "category": row["category"], "published": row["published"].isoformat() if row["published"] else None, "link": row["link"]}
            await conn.execute(APPEND, row["company_number"], json.dumps([item]), json.dumps([{"noticeId": row["notice_id"]}]))
            severity = "critical" if row["notice_code"] in CRITICAL else "warning"
            await conn.execute(ALERT, f"Gazette notice: {row['company_name']}", row["category"] or "Corporate insolvency notice",
                               row["published"] or datetime.now(timezone.utc), severity, row["company_number"], row["lon"], row["lat"])
    return written


def diff(conn) -> int:
    return 0
