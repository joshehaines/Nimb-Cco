"""HM Land Registry Price Paid Data (headerless CSV, complete, yearly and monthly-update files).

Fields: transaction id, price, date, postcode, property type (D/S/T/F/O), new build (Y/N),
duration (F/L), PAON, SAON, street, locality, town, district, county, PPD category (A/B),
record status (A added, C changed, D deleted; monthly file only). Licence: OGL v3.
"""
from __future__ import annotations

import csv
from typing import Iterator

from ._util import iter_lines, norm_postcode, parse_date, to_int

COLS = ["transaction_id", "price", "date", "postcode", "property_type", "new_build", "duration", "paon", "saon", "street", "locality", "town", "district", "county", "ppd_category", "record_status"]


def parse(path) -> Iterator[dict]:
    for row in csv.reader(iter_lines(path, (".csv", ".txt"))):
        if len(row) < 15:
            continue
        r = dict(zip(COLS, row + [""] * (len(COLS) - len(row))))
        if not r["transaction_id"] or to_int(r["price"]) is None:
            continue
        yield {
            "transaction_id": r["transaction_id"].strip("{}"),
            "price": to_int(r["price"]),
            "date": parse_date(r["date"][:10]),
            "postcode": norm_postcode(r["postcode"]),
            "property_type": r["property_type"] or "O",
            "new_build": r["new_build"] == "Y",
            "tenure": "Freehold" if r["duration"] == "F" else "Leasehold",
            "paon": r["paon"] or None,
            "saon": r["saon"] or None,
            "street": r["street"] or None,
            "locality": r["locality"] or None,
            "town": r["town"] or None,
            "district": r["district"] or None,
            "county": r["county"] or None,
            "address": " ".join(x for x in (r["saon"], r["paon"], r["street"]) if x).title(),
            "ppd_category": r["ppd_category"] or "A",
            "record_status": r["record_status"] or "A",
            "source": "HMLR Price Paid",
            "licence": "OGL",
        }
