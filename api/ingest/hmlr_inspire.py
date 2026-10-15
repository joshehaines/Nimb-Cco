"""INSPIRE Index Polygons.

Source: https://use-land-property-data.service.gov.uk/datasets/inspire/download
Cadence: monthly
Notes: Monthly GML zip per local authority. OGL with OS attribution. Load into titles (title_number unknown: INSPIRE ID only; join to CCOD via the separate INSPIRE ID look-up where licensed, else via address/UPRN).
Step 1 download: inspire_<Authority>.zip per local authority (scripts/data/fetch_sources.sh).
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://use-land-property-data.service.gov.uk/datasets/inspire'
CADENCE = 'monthly'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "inspire_*.zip", "inspire_*.gml", "inspire/*.zip", "inspire/*.gml", job="hmlr_inspire")

async def load(conn, path: Path) -> int:
    """Upsert INSPIRE polygons as titles keyed by INSPIRE id until the CCOD title number is known."""
    from .parsers import inspire
    from ._upsert import Batcher

    b = Batcher(conn, """insert into titles (title_number, inspire_id, tenure, geom, area_sqm, source, licence)
                 values ($1,$2,'Freehold',ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3),4326)),ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($3),4326)::geography),$4,$5)
                 on conflict (title_number) do update set geom=excluded.geom, area_sqm=excluded.area_sqm, fetched_at=now()""")
    for rec in inspire.parse(path):
        await b.add(f"INSPIRE{rec['inspire_id']}", rec["inspire_id"], json.dumps(rec["geometry"]), rec["source"], rec["licence"])
    await b.flush()
    return b.count

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
