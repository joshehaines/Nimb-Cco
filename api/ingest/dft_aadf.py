"""DfT road traffic counts.

Source: https://storage.googleapis.com/dft-statistics/road-traffic/downloads/data-gov-uk/dft_traffic_counts_aadf.zip
Cadence: annual
Notes: Annual AADF CSV for all count points with history; estimation_method column. OGL.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://storage.googleapis.com/dft-statistics/road-traffic/downloads/data-gov-uk/dft_traffic_counts_aadf.zip'
CADENCE = 'annual'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("dft_aadf: configure the source location first")
    return download(SOURCE_URL, workdir / "dft_aadf")


async def load(conn, path: Path) -> int:
    from .parsers import dft
    from ._upsert import run

    n = 0
    for rec in dft.parse(path):
        await run(conn, """insert into traffic_counts (count_point_id, road_name, road_type, geom, year, method, aadf, cars, lgv, hgv, pedal_cycles, history, source, licence)
                     values ($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict (count_point_id) do update set year=excluded.year,
                     method=excluded.method, aadf=excluded.aadf, cars=excluded.cars, lgv=excluded.lgv, hgv=excluded.hgv, pedal_cycles=excluded.pedal_cycles, history=excluded.history, fetched_at=now()""",
            rec["count_point_id"], rec["road_name"], rec["road_type"], rec["lon"], rec["lat"], rec["year"], rec["method"], rec["aadf"], rec["cars"], rec["lgv"], rec["hgv"], rec["pedal_cycles"], json.dumps(rec["history"]), rec["source"], rec["licence"])
        n += 1
    return n


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
