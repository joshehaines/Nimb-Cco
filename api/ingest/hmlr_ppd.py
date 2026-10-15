"""Price Paid Data.

Source: http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv
Cadence: monthly
Notes: Monthly update CSV (A/C/D record status). Residential only. OGL.
Step 1 download: pp-<year>.csv and pp-monthly-update.csv; the yearly file loads first, then the monthly A/C/D changes.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://www.gov.uk/government/collections/price-paid-data'
CADENCE = 'monthly'

def fetch(workdir: Path) -> list[Path]:
    files = local_inputs(workdir, "pp-*.csv", "pp-complete.csv", job="hmlr_ppd")
    return sorted(files, key=lambda p: (1 if "monthly" in p.name else 0, p.name))

PPD_SQL = """insert into price_paid (transaction_id, price, sale_date, postcode, property_type, new_build, tenure, address, locality, town, district, county, ppd_category, source, licence)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict (transaction_id) do update set price=excluded.price, sale_date=excluded.sale_date, fetched_at=now()"""


async def load(conn, path: Path) -> int:
    from .parsers import ppd
    from ._upsert import Batcher

    b = Batcher(conn, PPD_SQL, size=2000)
    deletes: list[str] = []
    for rec in ppd.parse(path):
        if rec["record_status"] == "D":
            deletes.append(rec["transaction_id"])
            continue
        if rec["date"] is None:
            continue
        await b.add(rec["transaction_id"], rec["price"], rec["date"], rec["postcode"], rec["property_type"], rec["new_build"], rec["tenure"], rec["address"], rec["locality"], rec["town"], rec["district"], rec["county"], rec["ppd_category"], rec["source"], rec["licence"])
    await b.flush()
    if deletes:
        await conn.execute("delete from price_paid where transaction_id = any($1::text[])", deletes)
    await conn.execute("update price_paid p set geom = c.geom, geocode = 'postcode' from postcode_centroids c where p.geom is null and p.postcode = c.postcode")
    return b.count

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
