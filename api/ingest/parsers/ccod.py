"""HM Land Registry CCOD (UK companies) and OCOD (overseas companies) CSV files.

Layout (full and change-only files share it; change-only adds Change Indicator and Change Date):
Title Number, Tenure, Property Address, District, County, Region, Postcode, Multiple Address Indicator,
Price Paid, Proprietor Name (1), Company Registration No. (1), Proprietorship Category (1),
Proprietor (1) Address (1..3), [Country Incorporated (1) in OCOD], ... repeated for proprietors 2-4,
Date Proprietor Added, Additional Proprietor Indicator.
Licence: HM Land Registry CCOD/OCOD terms. Research and internal analysis only; never direct marketing.
"""
from __future__ import annotations

from typing import Iterator

from ._util import norm_postcode, parse_date, pick, read_csv, to_int


def parse(path, dataset: str = "CCOD") -> Iterator[dict]:
    """Yield one record per title with a nested list of up to four proprietors."""
    for row in read_csv(path):
        title = pick(row, "Title Number")
        if not title:
            continue
        proprietors = []
        for i in (1, 2, 3, 4):
            name = pick(row, f"Proprietor Name ({i})")
            if not name:
                continue
            addr = ", ".join(a for a in (pick(row, f"Proprietor ({i}) Address ({j})") for j in (1, 2, 3)) if a)
            proprietors.append({
                "seq": i,
                "name": name,
                "company_number": (pick(row, f"Company Registration No. ({i})") or None),
                "category": pick(row, f"Proprietorship Category ({i})"),
                "address": addr or None,
                "country_incorporated": pick(row, f"Country Incorporated ({i})"),
                "redacted": False,
            })
        yield {
            "title_number": title,
            "tenure": pick(row, "Tenure"),
            "address": pick(row, "Property Address"),
            "district": pick(row, "District"),
            "county": pick(row, "County"),
            "region": pick(row, "Region"),
            "postcode": norm_postcode(pick(row, "Postcode")),
            "multiple_address": (pick(row, "Multiple Address Indicator") or "N").upper() == "Y",
            "price_paid": to_int(pick(row, "Price Paid")),
            "date_proprietor_added": parse_date(pick(row, "Date Proprietor Added")),
            "additional_proprietor": (pick(row, "Additional Proprietor Indicator") or "N").upper() == "Y",
            "change_indicator": pick(row, "Change Indicator"),
            "change_date": parse_date(pick(row, "Change Date")),
            "proprietors": proprietors,
            "source": f"HMLR {dataset}",
            "licence": "HMLR-CCOD",
        }
