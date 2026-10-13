"""Environmental and heritage constraints.

Source: https://environment.data.gov.uk/
Cadence: quarterly
Notes: EA Flood Zones 2/3 and surface water (WFS/shapefile), Historic England NHLE listed buildings (CSV/GeoJSON), Natural England SSSI/AONB/ALC (ArcGIS REST), MHCLG Green Belt (GeoJSON), JNCC Ramsar. OGL.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://environment.data.gov.uk/'
CADENCE = 'quarterly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("constraints: configure the source location first")
    return download(SOURCE_URL, workdir / "constraints")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("constraints.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
