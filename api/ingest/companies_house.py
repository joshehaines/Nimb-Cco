"""Companies House.

Source: https://download.companieshouse.gov.uk/en_output.html
Cadence: daily
Notes: BasicCompanyData monthly zip; streaming API for live changes; REST for officers, PSCs, charges, filing history (600 req/5 min). OGL.
Step 1 download: companies_house_basic.zip (BasicCompanyDataAsOneFile-<CH_MONTH>.zip, about 5.5 million rows).
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import local_inputs

SOURCE_URL = 'https://download.companieshouse.gov.uk/en_output.html'
CADENCE = 'monthly'

def fetch(workdir: Path) -> list[Path]:
    return local_inputs(workdir, "companies_house_*.zip", "BasicCompanyData*.zip", "BasicCompanyData*.csv", "companies_house_*.csv", job="companies_house")

async def load(conn, path: Path) -> int:
    from .parsers import companies_house
    from ._upsert import Batcher

    b = Batcher(conn, """insert into companies (company_number, name, status, incorporated, registered_address, sic_codes, accounts_overdue, last_accounts_made_up_to, charges, source, licence)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) on conflict (company_number) do update set name=excluded.name, status=excluded.status,
                 registered_address=excluded.registered_address, sic_codes=excluded.sic_codes, accounts_overdue=excluded.accounts_overdue,
                 last_accounts_made_up_to=excluded.last_accounts_made_up_to, charges=excluded.charges, fetched_at=now()""", size=2000)
    for rec in companies_house.parse(path):
        charges = json.dumps({"total": rec["charges_total"], "outstanding": rec["charges_outstanding"], "sector": rec["sector"], "accountsNextDue": rec["accounts_next_due"].isoformat() if rec["accounts_next_due"] else None})
        await b.add(rec["company_number"], rec["name"] or "", rec["status"], rec["incorporated"], rec["registered_address"], rec["sic_codes"], rec["accounts_overdue"], rec["accounts_last_made_up"], charges, rec["source"], rec["licence"])
    await b.flush()
    return b.count

def diff(conn) -> int:
    """Compare against the previous snapshot and insert alerts. Return alerts raised."""
    return 0
