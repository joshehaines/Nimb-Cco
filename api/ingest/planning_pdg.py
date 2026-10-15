"""Planning Data platform.

Source: https://www.planning.data.gov.uk/entity.json
Cadence: daily
Notes: Entity API by dataset (planning-application, conservation-area, article-4-direction-area, listed-building-outline, tree-preservation-zone, brownfield-land, local-plan-boundary). OGL. Application coverage still growing.
Step 1 download: planning_<dataset>.csv bulk files from files.planning.data.gov.uk (or entity.json responses as planning_<dataset>.json).
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://www.planning.data.gov.uk/'
CADENCE = 'daily'

def fetch(workdir: Path) -> list[Path]:
    files = local_inputs(workdir, "planning_*.csv", "planning_*.json", job="planning_pdg")
    return sorted(files, key=lambda p: (1 if "flood" in p.name else 0, p.stat().st_size))  # small sets first, the 2 GB flood zones last

async def load(conn, path: Path) -> int:
    from .parsers import planning_data
    from ._upsert import Batcher

    b = Batcher(conn, """insert into constraints (id, kind, name, grade, geom, source, licence) values ($1,$2,$3,$4,ST_SetSRID(ST_GeomFromGeoJSON($5),4326),$6,$7)
                 on conflict (id) do update set kind=excluded.kind, name=excluded.name, grade=excluded.grade, geom=excluded.geom, fetched_at=now()""", size=500)
    seen: set[str] = set()
    for rec in planning_data.parse(path):
        if rec["id"] in seen:
            await b.flush()
            seen.clear()
        seen.add(rec["id"])
        await b.add(rec["id"], rec["kind"], rec["name"], rec["grade"], json.dumps(rec["geometry"]), rec["source"], rec["licence"])
    await b.flush()
    return b.count

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
