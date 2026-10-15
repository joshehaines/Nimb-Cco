"""NHSBSA pharmaceutical list and dispensing.

Source: https://opendata.nhsbsa.net/dataset/consolidated-pharmaceutical-list
Cadence: quarterly + monthly
Notes: Quarterly consolidated list (ODS F-codes, trading names, addresses) and monthly dispensing data per contractor. OGL.
Step 1 download: nhsbsa_pharmacy_list.csv (latest consolidated pharmaceutical list resource).
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://opendata.nhsbsa.net/dataset/consolidated-pharmaceutical-list'
CADENCE = 'quarterly'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "nhsbsa_*list*.csv", "consol_pharmacy_list*.csv", job="nhsbsa")

async def load(conn, path: Path) -> int:
    from .parsers import nhsbsa
    from ._upsert import upsert_register

    return await upsert_register(conn, nhsbsa.parse_list(path))

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
