"""Ofsted registered childcare.

Source: https://www.data.gov.uk/dataset/1889ff52-5455-4980-ba74-15bb1edb4b60/childcare-providers-and-places
Cadence: monthly
Notes: Registered childcare CSV (URN, provider, setting, places) plus twice-yearly inspections statistics. OGL. Some providers opt out of publication.
Step 1 download: ofsted_childcare_providers.csv (the 'childcare provider data' CSV from the management information set).
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://www.gov.uk/government/statistical-data-sets/childcare-providers-and-inspections-management-information'
CADENCE = 'quarterly'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "ofsted_*.csv", "ofsted_*.ods", job="ofsted")

async def load(conn, path: Path) -> int:
    from .parsers import ofsted
    from ._upsert import upsert_register

    return await upsert_register(conn, ofsted.parse(path))

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
