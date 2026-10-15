"""DfT road traffic counts.

Source: https://storage.googleapis.com/dft-statistics/road-traffic/downloads/data-gov-uk/dft_traffic_counts_aadf.zip
Cadence: annual
Notes: Annual AADF CSV for all count points with history; estimation_method column. OGL.
Step 1 download: dft_traffic_counts_aadf.zip.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://roadtraffic.dft.gov.uk/downloads'
CADENCE = 'annual'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "dft_traffic_counts_aadf*.zip", "dft_traffic_counts_aadf*.csv", job="dft_aadf")

async def load(conn, path: Path) -> int:
    from .parsers import dft
    from ._upsert import Batcher

    b = Batcher(conn, """insert into traffic_counts (count_point_id, road_name, road_type, geom, year, method, aadf, cars, lgv, hgv, pedal_cycles, history, source, licence)
                 values ($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326),$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15) on conflict (count_point_id) do update set year=excluded.year,
                 method=excluded.method, aadf=excluded.aadf, cars=excluded.cars, lgv=excluded.lgv, hgv=excluded.hgv, pedal_cycles=excluded.pedal_cycles, history=excluded.history, fetched_at=now()""")
    for rec in dft.parse(path):
        if rec["lon"] is None or rec["lat"] is None:
            continue
        await b.add(rec["count_point_id"], rec["road_name"], rec["road_type"], rec["lon"], rec["lat"], rec["year"], rec["method"], rec["aadf"], rec["cars"], rec["lgv"], rec["hgv"], rec["pedal_cycles"], json.dumps(rec["history"]), rec["source"], rec["licence"])
    await b.flush()
    return b.count

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
