"""Care Quality Commission.

Source: https://api.service.cqc.org.uk/public/v1/locations
Cadence: weekly
Notes: Public API (locations, providers, inspection areas) plus weekly 'Locations regulated by CQC' spreadsheet with care home beds. OGL.
Step 1 download: cqc_active_locations.ods (the monthly 'HSCA Active Locations' file) or a saved API JSON.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://www.cqc.org.uk/about-us/transparency/using-cqc-data'
CADENCE = 'monthly'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "cqc_*.ods", "cqc_*.csv", "cqc_*.json", job="cqc")

async def load(conn, path: Path) -> int:
    from .parsers import cqc
    from ._upsert import upsert_register

    rows = cqc.parse_api(path) if str(path).lower().endswith(".json") else cqc.parse_csv(path)
    return await upsert_register(conn, rows)

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
