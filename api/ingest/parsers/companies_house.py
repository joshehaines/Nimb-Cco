"""Companies House BasicCompanyData (monthly bulk CSV, one row per live company).

Columns include CompanyName, CompanyNumber, RegAddress.AddressLine1/2, RegAddress.PostTown,
RegAddress.PostCode, CompanyCategory, CompanyStatus, IncorporationDate (dd/mm/yyyy),
Accounts.NextDueDate, Accounts.LastMadeUpDate, Mortgages.NumMortCharges, Mortgages.NumMortOutstanding,
SICCode.SicText_1-4, ConfStmtNextDueDate. Some headers carry a leading space in the published file.
Licence: OGL v3.
"""
from __future__ import annotations

from datetime import date
from typing import Iterator

from ._util import norm_postcode, parse_date, pick, read_csv, to_int

# SIC 2007 codes that map onto Christie & Co sectors (prefix match).
SIC_SECTORS = {
    "56302": "Pub", "56301": "Pub", "5630": "Pub",
    "56101": "Restaurant", "56102": "Restaurant", "56103": "Restaurant", "5610": "Restaurant",
    "55100": "Hotel", "55201": "Hotel", "55209": "Hotel", "5510": "Hotel",
    "87100": "Care Home", "87200": "Care Home", "87300": "Care Home", "87900": "Care Home", "8710": "Care Home", "8730": "Care Home",
    "88910": "Childcare", "85100": "Childcare",
    "86230": "Dental",
    "86210": "Medical", "86220": "Medical", "86900": "Medical", "75000": "Medical",
    "47730": "Pharmacy",
    "47110": "Convenience Retail", "47190": "Convenience Retail", "47300": "Convenience Retail", "47260": "Convenience Retail",
    "93130": "Leisure", "93110": "Leisure", "93290": "Leisure", "59140": "Leisure",
    "47760": "Garden Centre",
}

STATUS_MAP = {
    "active": "active", "active - proposal to strike off": "active", "liquidation": "liquidation", "in administration": "administration",
    "administration order": "administration", "receivership": "receivership", "receiver action": "receivership", "dissolved": "dissolved",
    "voluntary arrangement": "administration", "dormant": "dormant", "converted/closed": "dissolved",
}


def sector_for_sic(texts: list[str | None]) -> str | None:
    for t in texts:
        if not t:
            continue
        code = t.split(" - ")[0].strip()
        for prefix, sector in SIC_SECTORS.items():
            if code.startswith(prefix):
                return sector
    return None


def parse(path, today: date | None = None) -> Iterator[dict]:
    today = today or date.today()
    for row in read_csv(path):
        number = pick(row, "CompanyNumber", contains=("companynumber",))
        if not number:
            continue
        sics = [pick(row, f"SICCode.SicText_{i}") for i in (1, 2, 3, 4)]
        status_raw = (pick(row, "CompanyStatus") or "").lower()
        next_due = parse_date(pick(row, "Accounts.NextDueDate"))
        yield {
            "company_number": number,
            "name": pick(row, "CompanyName"),
            "status": STATUS_MAP.get(status_raw, status_raw or "active"),
            "category": pick(row, "CompanyCategory"),
            "incorporated": parse_date(pick(row, "IncorporationDate")),
            "dissolved": parse_date(pick(row, "DissolutionDate")),
            "registered_address": ", ".join(x for x in (pick(row, "RegAddress.AddressLine1"), pick(row, "RegAddress.AddressLine2"), pick(row, "RegAddress.PostTown")) if x),
            "registered_postcode": norm_postcode(pick(row, "RegAddress.PostCode")),
            "sic_codes": [s for s in sics if s],
            "sector": sector_for_sic(sics),
            "accounts_next_due": next_due,
            "accounts_last_made_up": parse_date(pick(row, "Accounts.LastMadeUpDate")),
            "accounts_overdue": bool(next_due and next_due < today),
            "charges_total": to_int(pick(row, "Mortgages.NumMortCharges")) or 0,
            "charges_outstanding": to_int(pick(row, "Mortgages.NumMortOutstanding")) or 0,
            "confirmation_statement_next_due": parse_date(pick(row, "ConfStmtNextDueDate")),
            "source": "Companies House",
            "licence": "OGL",
        }
