"""PlanIt aggregator.

Source: https://www.planit.org.uk/api/applics/json
Cadence: daily
Notes: Aggregated council planning applications: filter by auth, start_date, end_date, pg_sz; paced requests with contact in User-Agent.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://www.planit.org.uk/api/applics/json'
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("planning_planit: configure the source location first")
    return download(SOURCE_URL, workdir / "planning_planit")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("planning_planit.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
