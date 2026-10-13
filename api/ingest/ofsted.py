"""Ofsted registered childcare.

Source: https://www.data.gov.uk/dataset/1889ff52-5455-4980-ba74-15bb1edb4b60/childcare-providers-and-places
Cadence: monthly
Notes: Registered childcare CSV (URN, provider, setting, places) plus twice-yearly inspections statistics. OGL. Some providers opt out of publication.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://www.data.gov.uk/dataset/1889ff52-5455-4980-ba74-15bb1edb4b60/childcare-providers-and-places'
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("ofsted: configure the source location first")
    return download(SOURCE_URL, workdir / "ofsted")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("ofsted.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
