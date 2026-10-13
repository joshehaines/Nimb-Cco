"""National Highways WebTRIS.

Source: https://webtris.nationalhighways.co.uk/api/v1.0/sites
Cadence: daily
Notes: Unauthenticated JSON API: sites and daily/15-min reports for the strategic road network. OGL. Verify availability after the 2025 service interruption.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://webtris.nationalhighways.co.uk/api/v1.0/sites'
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("webtris: configure the source location first")
    return download(SOURCE_URL, workdir / "webtris")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("webtris.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
