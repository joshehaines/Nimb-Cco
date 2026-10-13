"""CRM nightly export.

Source: n/a (internal or vendor)
Cadence: nightly
Notes: Nightly CSV or API dump into crm_records with snapshot_date; triggers the linkage job and refreshes crm_matches.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = ''
CADENCE = 'nightly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("crm_export: configure the source location first")
    return download(SOURCE_URL, workdir / "crm_export")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("crm_export.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
