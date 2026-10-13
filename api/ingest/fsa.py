"""Food Hygiene Rating Scheme.

Source: https://ratings.food.gov.uk/open-data
Cadence: daily
Notes: XML per local authority (or JSON API, no key). Business type, rating, address, lat/lon. OGL. Covers pubs, restaurants, hotels, care homes, nurseries, shops.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://ratings.food.gov.uk/open-data'
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("fsa: configure the source location first")
    return download(SOURCE_URL, workdir / "fsa")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("fsa.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
