"""Price Paid Data.

Source: http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv
Cadence: monthly
Notes: Monthly update CSV (A/C/D record status). Residential only. OGL.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv'
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("hmlr_ppd: configure the source location first")
    return download(SOURCE_URL, workdir / "hmlr_ppd")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("hmlr_ppd.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
