"""EA LIDAR building heights.

Source: https://environment.data.gov.uk/survey
Cadence: annual
Notes: 1 m composite DSM and DTM tiles; building height = first-return DSM minus DTM masked to building footprints (OS OpenMap Local or NGD).
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://environment.data.gov.uk/survey'
CADENCE = 'annual'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("lidar_heights: configure the source location first")
    return download(SOURCE_URL, workdir / "lidar_heights")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("lidar_heights.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
