"""Premises licence registers.

Source: https://www.data.gov.uk/search?q=premises+licence
Cadence: varies
Notes: Council CSVs with varying schemas; map to register_records with register='Premises Licence'.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://www.data.gov.uk/search?q=premises+licence'
CADENCE = 'varies'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("licensing: configure the source location first")
    return download(SOURCE_URL, workdir / "licensing")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("licensing.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
