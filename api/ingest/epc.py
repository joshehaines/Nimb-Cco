"""Energy Performance Certificates.

Source: https://epc.opendatacommunities.org/api/v1/files
Cadence: monthly + daily
Notes: Bulk zips (domestic, non-domestic, display) with Basic auth API key; daily API for deltas. OGL.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://epc.opendatacommunities.org/api/v1/files'
CADENCE = 'monthly + daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("epc: configure the source location first")
    return download(SOURCE_URL, workdir / "epc")


async def load(conn, path: Path) -> int:
    from .parsers import epc
    from ._upsert import run

    n = 0
    for rec in epc.parse(path):
        await run(conn, """insert into epcs (certificate_id, kind, address, postcode, uprn, band, score, property_type, floor_area_sqm, inspection_date, lodgement_date, source, licence)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict (certificate_id) do update set band=excluded.band, score=excluded.score, lodgement_date=excluded.lodgement_date, fetched_at=now()""",
            rec["certificate_id"], rec["kind"], rec["address"], rec["postcode"], rec["uprn"], rec["band"], rec["score"], rec["property_type"], rec["floor_area_sqm"], rec["inspection_date"], rec["lodgement_date"], rec["source"], rec["licence"])
        n += 1
    return n


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
