"""NHSBSA pharmaceutical list and dispensing.

Source: https://opendata.nhsbsa.net/dataset/consolidated-pharmaceutical-list
Cadence: quarterly + monthly
Notes: Quarterly consolidated list (ODS F-codes, trading names, addresses) and monthly dispensing data per contractor. OGL.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://opendata.nhsbsa.net/dataset/consolidated-pharmaceutical-list'
CADENCE = 'quarterly + monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("nhsbsa: configure the source location first")
    return download(SOURCE_URL, workdir / "nhsbsa")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("nhsbsa.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
