"""VOA non-domestic rating list: compiled list entries and summary valuations ('*'-delimited text).

Compiled list entries (one line per hereditament), field order:
 1 entry number, 2 billing authority code, 3 NDR community code, 4 BA reference, 5 primary/secondary
 description code, 6 primary description text, 7 UARN, 8 full property identifier, 9 firm's name,
 10 number or name, 11-13 sub street levels 3-1, 14 street, 15 town, 16 postal district, 17 county,
 18 postcode, 19 scheme reference, 20 effective date, 21 composite indicator, 22 rateable value,
 23 appeal settlement code, 24 assessment reference, 25 list alteration date, 26 SCAT code and suffix,
 27 sub street level 3, 28 case number, 29 current from date, 30 current to date.
Summary valuations: record type in field 1; 01 = hereditament (UARN in field 3, address, scheme,
total value), 02 = floor line (floor, description, area m2, price per m2, value), 03 = additional item.
Licence: VOA restricted terms (not OGL): internal analysis only, no onward supply.
"""
from __future__ import annotations

from typing import Iterator

from ._util import norm_postcode, open_text, parse_date, to_float, to_int


def parse_list_entries(path) -> Iterator[dict]:
    for line in open_text(path):
        f = line.rstrip("\r\n").split("*")
        if len(f) < 22 or not f[6].strip():
            continue
        yield {
            "uarn": f[6].strip(),
            "ba_code": f[1].strip(),
            "ba_reference": f[3].strip(),
            "description_code": f[4].strip(),
            "description": f[5].strip(),
            "address": f[7].strip(),
            "firm_name": f[8].strip() or None,
            "number_or_name": f[9].strip() or None,
            "street": f[13].strip() or None,
            "town": f[14].strip() or None,
            "postal_district": f[15].strip() or None,
            "county": f[16].strip() or None,
            "postcode": norm_postcode(f[17].strip()),
            "scheme_reference": f[18].strip() or None,
            "effective_date": parse_date(f[19].strip()),
            "composite": f[20].strip().upper() == "C",
            "rateable_value": to_int(f[21]),
            "scat_code": f[25].strip() if len(f) > 25 else None,
            "current_from": parse_date(f[28].strip()) if len(f) > 28 else None,
            "current_to": parse_date(f[29].strip()) if len(f) > 29 else None,
            "source": "VOA rating list",
            "licence": "VOA-Restricted",
        }


def parse_summary_valuations(path) -> Iterator[dict]:
    """Yield one record per hereditament with its floor lines attached."""
    current: dict | None = None
    for line in open_text(path):
        f = line.rstrip("\r\n").split("*")
        if not f or not f[0].strip():
            continue
        rt = f[0].strip()
        if rt == "01":
            if current:
                yield current
            current = {
                "uarn": f[2].strip() if len(f) > 2 else None,
                "assessment_reference": f[1].strip(),
                "description": f[4].strip() if len(f) > 4 else None,
                "address": f[5].strip() if len(f) > 5 else None,
                "postcode": norm_postcode(f[6].strip()) if len(f) > 6 else None,
                "scheme_reference": f[7].strip() if len(f) > 7 else None,
                "total_area_sqm": to_float(f[8]) if len(f) > 8 else None,
                "rateable_value": to_int(f[9]) if len(f) > 9 else None,
                "floors": [],
                "source": "VOA summary valuation",
                "licence": "VOA-Restricted",
            }
        elif rt == "02" and current is not None:
            current["floors"].append({
                "line": to_int(f[1]),
                "floor": f[2].strip() if len(f) > 2 else None,
                "description": f[3].strip() if len(f) > 3 else None,
                "area_sqm": to_float(f[4]) if len(f) > 4 else None,
                "price_per_sqm": to_float(f[5]) if len(f) > 5 else None,
                "value": to_int(f[6]) if len(f) > 6 else None,
            })
        elif rt == "03" and current is not None:
            current.setdefault("additions", []).append({"description": f[2].strip() if len(f) > 2 else None, "value": to_int(f[3]) if len(f) > 3 else None})
    if current:
        yield current
