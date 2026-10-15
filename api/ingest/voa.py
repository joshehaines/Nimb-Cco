"""VOA rating list and summary valuations.

Source: https://voaratinglists.blob.core.windows.net/html/rlidata.htm
Cadence: weekly
Notes: 2026 compiled list and summary valuations as pipe-delimited text with weekly change files. Restricted terms (not OGL). Record types 01 (hereditament), 02/03 (valuation lines with floor areas), 04-07 (adjustments, plant, car parking).
Step 1 download: voa_2026_listentries_baseline.zip then voa_2026_listentries_changeupdate_NNNN.zip, loaded in that order.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://voaratinglists.blob.core.windows.net/html/rlidata.htm'
CADENCE = 'weekly'
LICENCE = 'VOA-Restricted'

def fetch(workdir: Path) -> list[Path]:
    files = local_inputs(workdir, "voa_*listentries*.zip", "voa_*listentries*.csv", "uk-englandwales-ndr-*listentries*.zip", job="voa")
    return sorted(files, key=lambda p: (0 if "baseline" in p.name else 1, p.name))

def _list_year(path: Path) -> int | None:
    import re

    m = re.search(r"(20\d\d)", path.name)
    return int(m.group(1)) if m else None


async def load(conn, path: Path) -> int:
    from .parsers import voa
    from ._upsert import Batcher

    year = _list_year(path)
    b = Batcher(conn, """insert into hereditaments (uarn, address, postcode, description, scat_code, rateable_value, effective_date, list_year, deleted, source, licence)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (uarn) do update set address=excluded.address, postcode=excluded.postcode,
                 description=excluded.description, scat_code=excluded.scat_code, rateable_value=excluded.rateable_value, effective_date=excluded.effective_date,
                 list_year=coalesce(excluded.list_year, hereditaments.list_year), deleted=excluded.deleted, fetched_at=now()""")
    seen: set[str] = set()
    for rec in voa.parse_list_entries(path):
        if rec["uarn"] in seen:  # change files can carry the same UARN more than once; keep each batch conflict-free
            await b.flush()
            seen.clear()
        seen.add(rec["uarn"])
        await b.add(rec["uarn"], rec["address"], rec["postcode"], rec["description"], rec["scat_code"], rec["rateable_value"], rec["effective_date"], year, rec.get("current_to") is not None, rec["source"], rec["licence"])
    await b.flush()
    return b.count

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
