"""Planning Data platform.

Source: https://www.planning.data.gov.uk/entity.json
Cadence: daily
Notes: Entity API by dataset (planning-application, conservation-area, article-4-direction-area, listed-building-outline, tree-preservation-zone, brownfield-land, local-plan-boundary). OGL. Application coverage still growing.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://www.planning.data.gov.uk/entity.json'
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("planning_pdg: configure the source location first")
    return download(SOURCE_URL, workdir / "planning_pdg")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("planning_pdg.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
