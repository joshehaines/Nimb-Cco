"""VOA non-domestic rating list: compiled list entries and summary valuations ('*'-delimited text).

Compiled list entries (one line per hereditament). The 2026 list has 29 '*'-separated fields:
 1 entry number, 2 billing authority code, 3 NDR community code, 4 BA reference, 5 description code,
 6 description text, 7 UARN, 8 full property identifier, 9 firm's name, 10 number or name, 11 street,
 12 town, 13 postal district, 14 county, 15 postcode, 16 scheme reference, 17 composite indicator,
 18 rateable value, 19 appeal settlement code, 20 assessment reference, 21 list alteration date,
 22 SCAT code and suffix, 23-25 sub street levels, 26 case number, 27 current from date, 28 current to date.
Weekly change-update files have 34 fields: 1 BA code, 3 BA reference, 4 UARN, 5 full address, 6 postcode,
 7 description code, 8 description, 9 rateable value or DELETED, 10 effective date, 15/16 change reason
 code and text, 18 SCAT, 21 list alteration date, 26 number or name, 27 street, 28 postal district, 29 town.
Older lists (pre-2026 layout) had the field order:
 1 entry number, 2 billing authority code, 3 NDR community code, 4 BA reference, 5 primary/secondary
 description code, 6 primary description text, 7 UARN, 8 full property identifier, 9 firm's name,
 10 number or name, 11-13 sub street levels 3-1, 14 street, 15 town, 16 postal district, 17 county,
 18 postcode, 19 scheme reference, 20 effective date, 21 composite indicator, 22 rateable value,
 23 appeal settlement code, 24 assessment reference, 25 list alteration date, 26 SCAT code and suffix,
 27 sub street level 3, 28 case number, 29 current from date, 30 current to date.
Summary valuations: record type in field 1; 01 = hereditament (UARN in field 3, address, scheme,
total value), 02 = floor line (floor, description, area m2, price per m2, value), 03 = additional item.
Licence: VOA restricted terms (not OGL): internal analysis only, no onward supply.
The downloads at voaratinglists.blob.core.windows.net are zips holding one '*'-delimited .csv each.
"""
from __future__ import annotations

import re
from typing import Iterator

from ._util import iter_lines, norm_postcode, open_text, parse_date, to_float, to_int


_POSTCODE = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$")


def _layout(f: list[str]) -> str:
    """Which column layout a line uses: 'change' (weekly change-update files, 34 fields, postcode in field 6),
    'compiled' (2026 compiled list, 29 fields, postcode in field 15) or 'legacy' (older lists, postcode in field 18)."""
    def pc(i: int) -> bool:
        return len(f) > i and bool(_POSTCODE.match(f[i].strip().upper()))

    if len(f) >= 30 and f[3].strip().isdigit() and (pc(5) or not f[5].strip()) and not f[6].strip().isdigit():
        return "change"
    if pc(14) or (len(f) < 30 and not pc(17)):
        return "compiled"
    return "legacy"


def _entry(f: list[str], layout: str) -> dict | None:
    g = lambda i: f[i].strip() if len(f) > i else ""  # noqa: E731
    if layout == "change":
        rv = g(8)
        deleted = rv.upper() == "DELETED"
        return {
            "uarn": g(3), "ba_code": g(0), "ba_reference": g(2), "description_code": g(6), "description": g(7) or None,
            "address": g(4) or None, "firm_name": None, "number_or_name": g(25) or None, "street": g(26) or None, "town": g(28) or None,
            "postal_district": g(27) or None, "county": None, "postcode": norm_postcode(g(5)), "scheme_reference": None,
            "effective_date": parse_date(g(9)), "composite": False, "rateable_value": None if deleted else to_int(rv),
            "scat_code": g(17) or None, "current_from": parse_date(g(20)), "current_to": parse_date(g(31)) if deleted else None,
            "change_reason": g(15) or None, "deleted": deleted,
        }
    if layout == "compiled":
        return {
            "uarn": g(6), "ba_code": g(1), "ba_reference": g(3), "description_code": g(4), "description": g(5) or None,
            "address": g(7) or None, "firm_name": g(8) or None, "number_or_name": g(9) or None, "street": g(10) or None, "town": g(11) or None,
            "postal_district": g(12) or None, "county": g(13) or None, "postcode": norm_postcode(g(14)), "scheme_reference": g(15) or None,
            "effective_date": parse_date(g(26)) or parse_date(g(20)), "composite": g(16).upper() == "C", "rateable_value": to_int(g(17)),
            "scat_code": g(21) or None, "current_from": parse_date(g(26)), "current_to": parse_date(g(27)), "change_reason": None, "deleted": bool(parse_date(g(27))),
        }
    return {
        "uarn": g(6), "ba_code": g(1), "ba_reference": g(3), "description_code": g(4), "description": g(5) or None,
        "address": g(7) or None, "firm_name": g(8) or None, "number_or_name": g(9) or None, "street": g(13) or None, "town": g(14) or None,
        "postal_district": g(15) or None, "county": g(16) or None, "postcode": norm_postcode(g(17)), "scheme_reference": g(18) or None,
        "effective_date": parse_date(g(19)), "composite": g(20).upper() == "C", "rateable_value": to_int(g(21)),
        "scat_code": g(25) or None, "current_from": parse_date(g(28)), "current_to": parse_date(g(29)), "change_reason": None, "deleted": bool(parse_date(g(29))),
    }


def parse_list_entries(path) -> Iterator[dict]:
    """Accepts the VOA zip, a bare file or a directory of change files.

    The baseline zip holds the compiled list plus a '-historic-' file of superseded entries; the historic
    file is skipped so an old assessment never overwrites the live one for the same UARN. Column layouts
    (see _layout) are detected per line, so baseline and change-update files load through the same path.
    """
    for line in iter_lines(path, (".csv", ".txt"), exclude=("historic",)):
        f = line.rstrip("\r\n").split("*")
        if len(f) < 22:
            continue
        rec = _entry(f, _layout(f))
        if not rec or not rec["uarn"] or not rec["uarn"].isdigit():
            continue
        rec.update({"source": "VOA rating list", "licence": "VOA-Restricted"})
        yield rec


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
