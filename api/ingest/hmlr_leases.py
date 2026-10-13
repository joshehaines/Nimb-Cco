"""Registered Leases.

Source: https://use-land-property-data.service.gov.uk/datasets/leases
Cadence: monthly
Notes: Optional: £5,000 + VAT per year, free 3-month exploration licence. Monthly CSV: Unique Identifier, Tenure, Register Property Description, County, Region, Associated Property Description ID, Associated Property Description, OS UPRN, Price Paid, Reg Order, Date of Lease, Term, Alienation Clause Indicator.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://use-land-property-data.service.gov.uk/datasets/leases'
CADENCE = 'monthly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("hmlr_leases: configure the source location first")
    return download(SOURCE_URL, workdir / "hmlr_leases")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("hmlr_leases.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
