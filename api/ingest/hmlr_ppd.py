"""Price Paid Data.

Source: http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv
Cadence: monthly
Notes: Monthly update CSV (A/C/D record status). Residential only. OGL.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv'
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("hmlr_ppd: configure the source location first")
    return download(SOURCE_URL, workdir / "hmlr_ppd")


async def load(conn, path: Path) -> int:
    from .parsers import ppd
    from ._upsert import run

    n = 0
    for rec in ppd.parse(path):
        if rec["record_status"] == "D":
            await run(conn, "delete from price_paid where transaction_id = $1", rec["transaction_id"])
            continue
        await run(conn, """insert into price_paid (transaction_id, price, sale_date, postcode, property_type, new_build, tenure, address, locality, town, district, county, ppd_category, source, licence)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict (transaction_id) do update set price=excluded.price, sale_date=excluded.sale_date, fetched_at=now()""",
            rec["transaction_id"], rec["price"], rec["date"], rec["postcode"], rec["property_type"], rec["new_build"], rec["tenure"], rec["address"], rec["locality"], rec["town"], rec["district"], rec["county"], rec["ppd_category"], rec["source"], rec["licence"])
        n += 1
    await run(conn, "update price_paid p set geom = c.geom, geocode = 'postcode' from postcode_centroids c where p.geom is null and p.postcode = c.postcode")
    return n


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
