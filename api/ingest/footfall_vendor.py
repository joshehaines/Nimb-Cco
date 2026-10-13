"""Footfall vendor feed.

Source: n/a (internal or vendor)
Cadence: monthly
Notes: Huq, BT Footfall API or Geolytix. Deliveries typically H3 cells or MSOA with monthly visits and dwell; load into footfall_cells with licence='Vendor'.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = ''
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("footfall_vendor: configure the source location first")
    return download(SOURCE_URL, workdir / "footfall_vendor")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("footfall_vendor.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
