"""Food Hygiene Rating Scheme.

Source: https://ratings.food.gov.uk/open-data
Cadence: daily
Notes: XML per local authority (or JSON API, no key). Business type, rating, address, lat/lon. OGL. Covers pubs, restaurants, hotels, care homes, nurseries, shops.
Step 1 download: fhrs_<authority id>.xml per local authority.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://ratings.food.gov.uk/open-data'
CADENCE = 'daily'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "fhrs_*.xml", "FHRS*.xml", job="fsa")

async def load(conn, path: Path) -> int:
    from .parsers import fsa
    from ._upsert import upsert_register

    return await upsert_register(conn, fsa.parse(path))

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
