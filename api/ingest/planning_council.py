"""Council portal adapters.

Source: n/a (internal or vendor)
Cadence: daily
Notes: Idox (publicaccess), Northgate (planningexplorer) and Agile adapters for priority authorities not well covered above. Respect robots and rate limits; link back to portal URL.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = ''
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("planning_council: configure the source location first")
    return download(SOURCE_URL, workdir / "planning_council")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("planning_council.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
