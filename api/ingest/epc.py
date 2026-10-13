"""Energy Performance Certificates.

Source: https://epc.opendatacommunities.org/api/v1/files
Cadence: monthly + daily
Notes: Bulk zips (domestic, non-domestic, display) with Basic auth API key; daily API for deltas. OGL.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://epc.opendatacommunities.org/api/v1/files'
CADENCE = 'monthly + daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("epc: configure the source location first")
    return download(SOURCE_URL, workdir / "epc")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("epc.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
