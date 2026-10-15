"""Food Standards Agency FHRS open data (XML per local authority) and the JSON API.

<FHRSEstablishment><EstablishmentCollection><EstablishmentDetail> with FHRSID, BusinessName,
BusinessType, BusinessTypeID, AddressLine1-4, PostCode, RatingValue, RatingDate, LocalAuthorityName,
Scores (Hygiene, Structural, ConfidenceInManagement), Geocode (Longitude, Latitude). Licence: OGL v3.
"""
from __future__ import annotations

import json
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


def _record(fhrsid, name, btype, addr, postcode, rating, rating_date, la, lon, lat, hygiene, structural, confidence, pending, extract) -> dict:
    return {
        "register": "FSA",
        "register_id": fhrsid,
        "name": name,
        "business_type": btype,
        "sector_hint": SECTOR_BY_TYPE.get(btype or ""),
        "address": addr,
        "postcode": norm_postcode(postcode),
        "rating": rating,
        "rating_date": parse_date(rating_date),
        "status": "Registered",
        "local_authority": la,
        "lon": to_float(lon),
        "lat": to_float(lat),
        "extra": {"hygiene": to_int(hygiene), "structural": to_int(structural), "confidence": to_int(confidence), "newRatingPending": str(pending or "False").lower() == "true", "extractDate": extract,
                  "businessType": btype, "sectorHint": SECTOR_BY_TYPE.get(btype or ""), "localAuthority": la},
        "source": "FSA FHRS",
        "licence": "OGL",
    }


def parse_json(data) -> Iterator[dict]:
    """The JSON API (api.ratings.food.gov.uk/Establishments?localAuthorityId=..): one response or a list of pages."""
    obj = json.loads(text_of(data)) if not isinstance(data, (dict, list)) else data
    pages = obj if isinstance(obj, list) else [obj]
    for page in pages:
        for e in page.get("establishments", []) if isinstance(page, dict) else []:
            addr = ", ".join(x for x in (e.get("AddressLine1"), e.get("AddressLine2"), e.get("AddressLine3"), e.get("AddressLine4")) if x)
            geo = e.get("geocode") or {}
            sc = e.get("scores") or {}
            yield _record(str(e.get("FHRSID")), e.get("BusinessName"), e.get("BusinessType"), addr or None, e.get("PostCode"), e.get("RatingValue"), e.get("RatingDate"),
                          e.get("LocalAuthorityName"), geo.get("longitude"), geo.get("latitude"), sc.get("Hygiene"), sc.get("Structural"), sc.get("ConfidenceInManagement"), e.get("NewRatingPending"), None)


def parse(path) -> Iterator[dict]:
    """An open-data XML file per authority, or a saved JSON API response (fhrs_<id>.json)."""
    text = text_of(path)
    if not text.strip():
        return
    if text.lstrip().startswith(("{", "[")):
        yield from parse_json(text)
        return
    root = ET.fromstring(text)
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
                "businessType": t("BusinessType"), "sectorHint": SECTOR_BY_TYPE.get(t("BusinessType") or ""), "localAuthority": t("LocalAuthorityName"),
            },
            "source": "FSA FHRS",
            "licence": "OGL",
        }
