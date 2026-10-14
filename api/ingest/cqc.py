"""Care Quality Commission.

Source: https://api.service.cqc.org.uk/public/v1/locations
Cadence: weekly
Notes: Public API (locations, providers, inspection areas) plus weekly 'Locations regulated by CQC' spreadsheet with care home beds. OGL.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://api.service.cqc.org.uk/public/v1/locations'
CADENCE = 'weekly'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("cqc: configure the source location first")
    return download(SOURCE_URL, workdir / "cqc")


async def load(conn, path: Path) -> int:
    from .parsers import cqc
    from ._upsert import upsert_register

    rows = cqc.parse_csv(path) if str(path).lower().endswith(".csv") else cqc.parse_api(path)
    return await upsert_register(conn, rows)


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
