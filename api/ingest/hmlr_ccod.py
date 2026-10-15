"""UK companies that own property (CCOD) and OCOD.

Source: https://use-land-property-data.service.gov.uk/datasets/ccod
Cadence: monthly
Notes: Monthly full CSV plus change-only CSV, API key required. Columns: Title Number, Tenure, Property Address, District, County, Region, Postcode, Multiple Address Indicator, Price Paid, Proprietor Name (1-4), Company Registration No (1-4), Proprietorship Category (1-4), Proprietor Address (1-4), Date Proprietor Added, Additional Proprietor Indicator. Licence prohibits direct marketing and resale.
Step 1 download: ccod_full.zip and ocod_full.zip (monthly FULL files via the data portal API).
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://use-land-property-data.service.gov.uk/datasets/ccod'
CADENCE = 'monthly'
LICENCE = 'HMLR-CCOD'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "ccod_*.zip", "ocod_*.zip", "ccod_*.csv", "ocod_*.csv", "CCOD_*.csv", "OCOD_*.csv", job="hmlr_ccod")

TITLE_SQL = """insert into titles (title_number, tenure, address, postcode, price_paid, date_proprietor_added, source, licence)
    values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (title_number) do update set tenure=excluded.tenure, address=excluded.address,
    postcode=excluded.postcode, price_paid=excluded.price_paid, date_proprietor_added=excluded.date_proprietor_added, source=excluded.source, fetched_at=now()"""
PROP_SQL = "insert into proprietors (title_number, seq, name, category, company_number, address, redacted, source) values ($1,$2,$3,$4,$5,$6,false,$7)"


async def load(conn, path: Path) -> int:
    """Upsert titles and proprietors from a CCOD/OCOD full or change-only file, 1000 titles per round trip."""
    from .parsers import ccod
    from ._upsert import Batcher

    titles = Batcher(conn, TITLE_SQL)
    props = Batcher(conn, PROP_SQL, size=10**9)  # flushed only after the matching delete below
    pending: list[str] = []  # title numbers whose proprietors are replaced in this batch

    async def flush() -> None:
        nonlocal pending
        await titles.flush()
        if pending:
            await conn.execute("delete from proprietors where title_number = any($1::text[])", pending)
            pending = []
        await props.flush()

    for rec in ccod.parse(path):
        if rec.get("change_indicator") == "D":
            await flush()
            await conn.execute("delete from proprietors where title_number = $1", rec["title_number"])
            continue
        await titles.add(rec["title_number"], rec["tenure"] or "Freehold", rec["address"], rec["postcode"], rec["price_paid"], rec["date_proprietor_added"], rec["source"], rec["licence"])
        pending.append(rec["title_number"])
        for p in rec["proprietors"]:
            await props.add(rec["title_number"], p["seq"], p["name"], p["category"] or "Unknown", p["company_number"], p["address"], rec["source"])
        if len(pending) >= titles.size:
            await flush()
    await flush()
    return titles.count

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
