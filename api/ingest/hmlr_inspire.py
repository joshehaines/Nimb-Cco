"""INSPIRE Index Polygons.

Source: https://use-land-property-data.service.gov.uk/datasets/inspire/download
Cadence: monthly
Notes: Monthly GML zip per local authority. OGL with OS attribution. Load into titles (title_number unknown: INSPIRE ID only; join to CCOD via the separate INSPIRE ID look-up where licensed, else via address/UPRN).
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://use-land-property-data.service.gov.uk/datasets/inspire/download'
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("hmlr_inspire: configure the source location first")
    return download(SOURCE_URL, workdir / "hmlr_inspire")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("hmlr_inspire.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
