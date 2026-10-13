"""Business linkage.

Source: n/a (internal or vendor)
Cadence: after each load
Notes: Builds the businesses table: register_records (CQC/Ofsted/NHSBSA/FSA) -> UPRN via OS Places -> hereditaments by UPRN/postcode+description -> titles by UPRN or INSPIRE polygon containment -> operator company via name/number -> freeholder via CCOD. Computes distress_flags.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = ''
CADENCE = 'after each load'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("linkage: configure the source location first")
    return download(SOURCE_URL, workdir / "linkage")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("linkage.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
