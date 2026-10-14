"""Companies House.

Source: https://download.companieshouse.gov.uk/en_output.html
Cadence: daily
Notes: BasicCompanyData monthly zip; streaming API for live changes; REST for officers, PSCs, charges, filing history (600 req/5 min). OGL.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import download

SOURCE_URL = 'https://download.companieshouse.gov.uk/en_output.html'
CADENCE = 'daily'


def fetch(workdir: Path) -> Path:
    """Download the latest files for this source into workdir and return the path."""
    if not SOURCE_URL:
        raise NotImplementedError("companies_house: configure the source location first")
    return download(SOURCE_URL, workdir / "companies_house")


async def load(conn, path: Path) -> int:
    from .parsers import companies_house
    from ._upsert import run

    n = 0
    for rec in companies_house.parse(path):
        await run(conn, """insert into companies (company_number, name, status, incorporated, registered_address, sic_codes, sector, accounts_overdue, accounts_next_due, charges_outstanding, source, licence)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (company_number) do update set name=excluded.name, status=excluded.status,
                     registered_address=excluded.registered_address, sic_codes=excluded.sic_codes, sector=excluded.sector, accounts_overdue=excluded.accounts_overdue,
                     accounts_next_due=excluded.accounts_next_due, charges_outstanding=excluded.charges_outstanding, fetched_at=now()""",
            rec["company_number"], rec["name"], rec["status"], rec["incorporated"], rec["registered_address"], rec["sic_codes"], rec["sector"], rec["accounts_overdue"], rec["accounts_next_due"], rec["charges_outstanding"], rec["source"], rec["licence"])
        n += 1
    return n


def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
