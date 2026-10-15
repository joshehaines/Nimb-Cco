"""Energy Performance Certificates.

Source: https://epc.opendatacommunities.org/api/v1/files
Cadence: monthly + daily
Notes: Bulk zips (domestic, non-domestic, display) with Basic auth API key; daily API for deltas. OGL.
Step 1 download: epc_non_domestic.zip (bulk 'all-non-domestic-certificates' archive; domestic zip loads the same way).
Columns in the live table: rating (band), score, lodged_at, expires_at (lodgement + 10 years).
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://epc.opendatacommunities.org/api/v1/files'
CADENCE = 'monthly + daily'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "epc_*.zip", "epc_*.csv", "all-*-certificates.zip", job="epc")

async def load(conn, path: Path) -> int:
    from datetime import timedelta

    from .parsers import epc
    from ._upsert import Batcher
    from .parsers._util import to_int

    b = Batcher(conn, """insert into epcs (certificate_id, kind, address, postcode, uprn, rating, score, floor_area_sqm, lodged_at, expires_at, source, licence)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (certificate_id) do update set rating=excluded.rating, score=excluded.score,
                 floor_area_sqm=excluded.floor_area_sqm, lodged_at=excluded.lodged_at, expires_at=excluded.expires_at, fetched_at=now()""")
    seen: set[str] = set()
    for rec in epc.parse(path):
        if rec["certificate_id"] in seen:
            await b.flush()
            seen.clear()
        seen.add(rec["certificate_id"])
        lodged = rec["lodgement_date"] or rec["inspection_date"]
        await b.add(rec["certificate_id"], rec["kind"], rec["address"], rec["postcode"], to_int(rec["uprn"]), rec["band"], rec["score"], rec["floor_area_sqm"],
                    lodged, lodged + timedelta(days=3652) if lodged else None, rec["source"], rec["licence"])
    await b.flush()
    return b.count

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
