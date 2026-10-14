"""NHSBSA consolidated pharmaceutical list (quarterly CSV) and monthly dispensing summary.

List columns: SNAPSHOT_DATE, PHARMACY_ODS_CODE_(F-CODE), PHARMACY_TRADING_NAME, ADDRESS_FIELD_1-4,
POST_CODE, CONTRACT_TYPE, HEALTH_AND_WELLBEING_BOARD, ... Licence: OGL v3.
Dispensing columns (contractor level): YEAR_MONTH, PHARMACY_ODS_CODE, TOTAL_ITEMS (names vary; matched by tokens).
"""
from __future__ import annotations

from typing import Iterator

from ._util import norm_postcode, parse_date, pick, read_csv, to_int


def parse_list(path) -> Iterator[dict]:
    for row in read_csv(path):
        code = pick(row, "PHARMACY_ODS_CODE_(F-CODE)", "PHARMACY_ODS_CODE", contains=("ods", "code"))
        if not code:
            continue
        addr = ", ".join(x for x in (pick(row, f"ADDRESS_FIELD_{i}") for i in (1, 2, 3, 4)) if x)
        yield {
            "register": "NHSBSA",
            "register_id": code,
            "name": pick(row, "PHARMACY_TRADING_NAME", contains=("trading",)),
            "address": addr,
            "postcode": norm_postcode(pick(row, "POST_CODE", "POSTCODE", contains=("post",))),
            "status": "Registered",
            "snapshot_date": parse_date(pick(row, "SNAPSHOT_DATE", contains=("snapshot",))),
            "extra": {"contractType": pick(row, "CONTRACT_TYPE", contains=("contract",)), "hwb": pick(row, "HEALTH_AND_WELLBEING_BOARD", contains=("wellbeing",))},
            "source": "NHSBSA",
            "licence": "OGL",
        }


def parse_dispensing(path) -> Iterator[dict]:
    for row in read_csv(path):
        code = pick(row, "PHARMACY_ODS_CODE", contains=("ods",)) or pick(row, contains=("code",))
        items = to_int(pick(row, "TOTAL_ITEMS", "ITEMS", contains=("items",)))
        if not code or items is None:
            continue
        yield {"register_id": code, "year_month": pick(row, "YEAR_MONTH", contains=("month",)), "items": items}
