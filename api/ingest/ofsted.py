"""Ofsted registered childcare.

Source: https://www.data.gov.uk/dataset/1889ff52-5455-4980-ba74-15bb1edb4b60/childcare-providers-and-places
Cadence: monthly
Notes: Registered childcare CSV (URN, provider, setting, places) plus twice-yearly inspections statistics. OGL. Some providers opt out of publication.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://www.data.gov.uk/dataset/1889ff52-5455-4980-ba74-15bb1edb4b60/childcare-providers-and-places'
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("ofsted: configure the source location first")
    return download(SOURCE_URL, workdir / "ofsted")


async def load(conn, path: Path) -> int:
    from .parsers import ofsted
    from ._upsert import upsert_register

    return await upsert_register(conn, ofsted.parse(path))


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
