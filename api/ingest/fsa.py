"""Food Hygiene Rating Scheme.

Source: https://ratings.food.gov.uk/open-data
Cadence: daily
Notes: XML per local authority (or JSON API, no key). Business type, rating, address, lat/lon. OGL. Covers pubs, restaurants, hotels, care homes, nurseries, shops.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://ratings.food.gov.uk/open-data'
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("fsa: configure the source location first")
    return download(SOURCE_URL, workdir / "fsa")


async def load(conn, path: Path) -> int:
    from .parsers import fsa
    from ._upsert import upsert_register

    return await upsert_register(conn, fsa.parse(path))


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
