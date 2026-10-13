"""UK companies that own property (CCOD) and OCOD.

Source: https://use-land-property-data.service.gov.uk/datasets/ccod
Cadence: monthly
Notes: Monthly full CSV plus change-only CSV, API key required. Columns: Title Number, Tenure, Property Address, District, County, Region, Postcode, Multiple Address Indicator, Price Paid, Proprietor Name (1-4), Company Registration No (1-4), Proprietorship Category (1-4), Proprietor Address (1-4), Date Proprietor Added, Additional Proprietor Indicator. Licence prohibits direct marketing and resale.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://use-land-property-data.service.gov.uk/datasets/ccod'
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("hmlr_ccod: configure the source location first")
    return download(SOURCE_URL, workdir / "hmlr_ccod")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("hmlr_ccod.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
