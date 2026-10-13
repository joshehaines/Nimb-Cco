"""VOA rating list and summary valuations.

Source: https://voaratinglists.blob.core.windows.net/html/rlidata.htm
Cadence: weekly
Notes: 2026 compiled list and summary valuations as pipe-delimited text with weekly change files. Restricted terms (not OGL). Record types 01 (hereditament), 02/03 (valuation lines with floor areas), 04-07 (adjustments, plant, car parking).
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://voaratinglists.blob.core.windows.net/html/rlidata.htm'
CADENCE = 'weekly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("voa: configure the source location first")
    return download(SOURCE_URL, workdir / "voa")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("voa.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
