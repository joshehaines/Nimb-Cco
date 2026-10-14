"""UK companies that own property (CCOD) and OCOD.

Source: https://use-land-property-data.service.gov.uk/datasets/ccod
Cadence: monthly
Notes: Monthly full CSV plus change-only CSV, API key required. Columns: Title Number, Tenure, Property Address, District, County, Region, Postcode, Multiple Address Indicator, Price Paid, Proprietor Name (1-4), Company Registration No (1-4), Proprietorship Category (1-4), Proprietor Address (1-4), Date Proprietor Added, Additional Proprietor Indicator. Licence prohibits direct marketing and resale.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://use-land-property-data.service.gov.uk/datasets/ccod'
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("hmlr_ccod: configure the source location first")
    return download(SOURCE_URL, workdir / "hmlr_ccod")


async def load(conn, path: Path) -> int:
    """Upsert titles and proprietors from a CCOD/OCOD full or change-only file."""
    from .parsers import ccod
    from ._upsert import run

    n = 0
    for rec in ccod.parse(path):
        if rec.get("change_indicator") == "D":
            await run(conn, "delete from proprietors where title_number = $1", rec["title_number"])
            continue
        await run(conn, """insert into titles (title_number, tenure, address, postcode, price_paid, date_proprietor_added, source, licence)
                     values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (title_number) do update set tenure=excluded.tenure, address=excluded.address,
                     postcode=excluded.postcode, price_paid=excluded.price_paid, date_proprietor_added=excluded.date_proprietor_added, fetched_at=now()""",
            rec["title_number"], rec["tenure"], rec["address"], rec["postcode"], rec["price_paid"], rec["date_proprietor_added"], rec["source"], rec["licence"])
        await run(conn, "delete from proprietors where title_number = $1", rec["title_number"])
        for p in rec["proprietors"]:
            await run(conn, "insert into proprietors (title_number, seq, name, category, company_number, address, redacted) values ($1,$2,$3,$4,$5,$6,false)",
                rec["title_number"], p["seq"], p["name"], p["category"], p["company_number"], p["address"])
        n += 1
    return n


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
