"""Energy Performance Certificates: non-domestic, domestic and display energy certificate CSVs.

Two header generations are accepted: the opendatacommunities.org files (LMK_KEY, ASSET_RATING, ...) and the
get-energy-performance-data.communities.gov.uk bulk files (certificate_number, asset_rating, ..., lower case).

Non-domestic: LMK_KEY, ADDRESS1-3, POSTCODE, BUILDING_REFERENCE_NUMBER, ASSET_RATING, ASSET_RATING_BAND,
PROPERTY_TYPE, INSPECTION_DATE, LODGEMENT_DATE, FLOOR_AREA, UPRN, LOCAL_AUTHORITY_LABEL.
Domestic: LMK_KEY, ADDRESS1-3, POSTCODE, CURRENT_ENERGY_RATING, CURRENT_ENERGY_EFFICIENCY,
PROPERTY_TYPE, INSPECTION_DATE, LODGEMENT_DATE, TOTAL_FLOOR_AREA, UPRN. Licence: OGL v3.
"""
from __future__ import annotations

from typing import Iterator

from ._util import norm_postcode, parse_date, pick, read_csv, to_float, to_int


def parse(path, kind: str = "auto") -> Iterator[dict]:
    """A certificates CSV, or the bulk zip (certificates-<year>.csv members; any recommendations CSV is skipped)."""
    for row in read_csv(path, exclude=("recommendation",)):
        key = pick(row, "LMK_KEY", "certificate_number")  # LMK_KEY in the old opendatacommunities files, certificate_number in the 2026 API bulk files
        if not key:
            continue
        domestic = kind == "domestic" or (kind == "auto" and "current_energy_rating" in row)
        band = pick(row, "CURRENT_ENERGY_RATING") if domestic else pick(row, "ASSET_RATING_BAND")
        score = to_int(pick(row, "CURRENT_ENERGY_EFFICIENCY")) if domestic else to_int(pick(row, "ASSET_RATING"))
        addr = ", ".join(x for x in (pick(row, "ADDRESS1"), pick(row, "ADDRESS2"), pick(row, "ADDRESS3")) if x) or pick(row, "ADDRESS")
        yield {
            "certificate_id": key,
            "kind": "domestic" if domestic else "non-domestic",
            "address": addr,
            "postcode": norm_postcode(pick(row, "POSTCODE")),
            "uprn": pick(row, "UPRN"),
            "building_reference": pick(row, "BUILDING_REFERENCE_NUMBER"),
            "band": band,
            "score": score,
            "property_type": pick(row, "PROPERTY_TYPE"),
            "floor_area_sqm": to_float(pick(row, "FLOOR_AREA", "TOTAL_FLOOR_AREA")),
            "inspection_date": parse_date(pick(row, "INSPECTION_DATE")),
            "lodgement_date": parse_date(pick(row, "LODGEMENT_DATE")),
            "local_authority": pick(row, "LOCAL_AUTHORITY_LABEL"),
            # MEES: F and G cannot be let; from 2027/2030 proposals tighten to C/B for non-domestic
            "below_mees": (band or "") in ("F", "G"),
            "source": "EPC open data",
            "licence": "OGL",
        }
