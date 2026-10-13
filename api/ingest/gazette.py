"""The Gazette insolvency notices.

Source: https://www.thegazette.co.uk/insolvency/notice/data.feed
Cadence: daily
Notes: Atom/JSON notice feeds filtered by notice code (corporate insolvency 2400-2499). Bulk data service is paid.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://www.thegazette.co.uk/insolvency/notice/data.feed'
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("gazette: configure the source location first")
    return download(SOURCE_URL, workdir / "gazette")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("gazette.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
