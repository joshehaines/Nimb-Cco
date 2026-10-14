"""Food Standards Agency FHRS open data (XML per local authority).

<FHRSEstablishment><EstablishmentCollection><EstablishmentDetail> with FHRSID, BusinessName,
BusinessType, BusinessTypeID, AddressLine1-4, PostCode, RatingValue, RatingDate, LocalAuthorityName,
Scores (Hygiene, Structural, ConfidenceInManagement), Geocode (Longitude, Latitude). Licence: OGL v3.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Iterator

from ._util import norm_postcode, parse_date, text_of, to_float, to_int

SECTOR_BY_TYPE = {
    "Pub/bar/nightclub": "Pub",
    "Restaurant/Cafe/Canteen": "Restaurant",
    "Takeaway/sandwich shop": "Restaurant",
    "Hotel/bed & breakfast/guest house": "Hotel",
    "Hospitals/Childcare/Caring Premises": "Care Home",
    "Retailers - supermarkets/hypermarkets": "Convenience Retail",
    "Retailers - other": "Convenience Retail",
}


def parse(path) -> Iterator[dict]:
    root = ET.fromstring(text_of(path))
    la = root.findtext(".//Header/ExtractDate")
    for e in root.iter("EstablishmentDetail"):
        t = lambda name: (e.findtext(name) or "").strip() or None  # noqa: E731
        addr = ", ".join(x for x in (t("AddressLine1"), t("AddressLine2"), t("AddressLine3"), t("AddressLine4")) if x)
        scores = e.find("Scores")
        yield {
            "register": "FSA",
            "register_id": t("FHRSID"),
            "name": t("BusinessName"),
            "business_type": t("BusinessType"),
            "sector_hint": SECTOR_BY_TYPE.get(t("BusinessType") or ""),
            "address": addr,
            "postcode": norm_postcode(t("PostCode")),
            "rating": t("RatingValue"),
            "rating_date": parse_date(t("RatingDate")),
            "status": "Registered",
            "local_authority": t("LocalAuthorityName"),
            "lon": to_float(e.findtext("Geocode/Longitude")),
            "lat": to_float(e.findtext("Geocode/Latitude")),
            "extra": {
                "hygiene": to_int(scores.findtext("Hygiene")) if scores is not None else None,
                "structural": to_int(scores.findtext("Structural")) if scores is not None else None,
                "confidence": to_int(scores.findtext("ConfidenceInManagement")) if scores is not None else None,
                "newRatingPending": (t("NewRatingPending") or "False").lower() == "true",
                "extractDate": la,
            },
            "source": "FSA FHRS",
            "licence": "OGL",
        }
