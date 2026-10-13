"""Alert generation.

Source: n/a (internal or vendor)
Cadence: after each load
Notes: Diff proprietors, company status and filings, register ratings, planning, leases, EPC and VOA against snapshots; write alerts for users whose watch_items or sector subscriptions match.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = ''
CADENCE = 'after each load'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("alerts: configure the source location first")
    return download(SOURCE_URL, workdir / "alerts")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("alerts.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
