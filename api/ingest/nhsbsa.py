"""NHSBSA pharmaceutical list and dispensing.

Source: https://opendata.nhsbsa.net/dataset/consolidated-pharmaceutical-list
Cadence: quarterly + monthly
Notes: Quarterly consolidated list (ODS F-codes, trading names, addresses) and monthly dispensing data per contractor. OGL.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://opendata.nhsbsa.net/dataset/consolidated-pharmaceutical-list'
CADENCE = 'quarterly + monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("nhsbsa: configure the source location first")
    return download(SOURCE_URL, workdir / "nhsbsa")


async def load(conn, path: Path) -> int:
    from .parsers import nhsbsa
    from ._upsert import upsert_register

    return await upsert_register(conn, nhsbsa.parse_list(path))


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
