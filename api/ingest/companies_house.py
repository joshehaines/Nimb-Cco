"""Companies House.

Source: https://download.companieshouse.gov.uk/en_output.html
Cadence: daily
Notes: BasicCompanyData monthly zip; streaming API for live changes; REST for officers, PSCs, charges, filing history (600 req/5 min). OGL.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://download.companieshouse.gov.uk/en_output.html'
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("companies_house: configure the source location first")
    return download(SOURCE_URL, workdir / "companies_house")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("companies_house.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
