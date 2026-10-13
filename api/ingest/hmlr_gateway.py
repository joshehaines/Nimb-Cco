"""Business Gateway official copies.

Source: https://landregistry.github.io/bgtechdoc/
Cadence: on demand
Notes: On demand. OC1 register/title plan, OC2 lease and referred documents, £7 each. Requires Business e-services account, development licence and HMLR-issued client certificate. Store PDF once per (title, kind) and queue extraction.
"""
from __future__ import annotations

from pathlib import Path

from .base import download

SOURCE_URL = 'https://landregistry.github.io/bgtechdoc/'
CADENCE = 'on demand'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("hmlr_gateway: configure the source location first")
    return download(SOURCE_URL, workdir / "hmlr_gateway")


def load(conn, path: Path) -> int:
    """Parse the downloaded file(s) and upsert into the schema. Return rows written."""
    raise NotImplementedError("hmlr_gateway.load: implement parser and upsert (see docstring)")


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
