"""VOA rating list and summary valuations.

Source: https://voaratinglists.blob.core.windows.net/html/rlidata.htm
Cadence: weekly
Notes: 2026 compiled list and summary valuations as pipe-delimited text with weekly change files. Restricted terms (not OGL). Record types 01 (hereditament), 02/03 (valuation lines with floor areas), 04-07 (adjustments, plant, car parking).
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://voaratinglists.blob.core.windows.net/html/rlidata.htm'
CADENCE = 'weekly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("voa: configure the source location first")
    return download(SOURCE_URL, workdir / "voa")


async def load(conn, path: Path) -> int:
    from .parsers import voa
    from ._upsert import run

    n = 0
    for rec in voa.parse_list_entries(path):
        await run(conn, """insert into hereditaments (uarn, address, postcode, description, scat_code, rateable_value, effective_date, source, licence)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (uarn) do update set address=excluded.address, postcode=excluded.postcode,
                     description=excluded.description, scat_code=excluded.scat_code, rateable_value=excluded.rateable_value, effective_date=excluded.effective_date, fetched_at=now()""",
            rec["uarn"], rec["address"], rec["postcode"], rec["description"], rec["scat_code"], rec["rateable_value"], rec["effective_date"], rec["source"], rec["licence"])
        n += 1
    return n


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
