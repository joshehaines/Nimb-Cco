"""Care Quality Commission locations: public API JSON and the monthly 'HSCA Active Locations' file.

CQC now publishes that file as .ods (https://www.cqc.org.uk/about-us/transparency/using-cqc-data); parse_csv
reads .ods and .csv alike through read_csv.

API (https://api.service.cqc.org.uk/public/v1/locations/{id}): locationId, providerId, name,
postalAddressLine1, postalAddressTownCity, postalCode, registrationStatus, registrationDate,
numberOfBeds, onspdLatitude, onspdLongitude, gacServiceTypes[], regulatedActivities[],
currentRatings.overall.rating/reportDate.
CSV: Location ID, Location Name, Location Postal Code, Care homes beds, Location Latest Overall
Rating, Provider ID, Provider Name, Location Latitude, Location Longitude, Care home?, ...
Licence: OGL v3.
"""
from __future__ import annotations

import json
from typing import Iterator

from ._util import norm_postcode, parse_date, pick, read_csv, text_of, to_float, to_int


def _record(location_id, name, provider_id, provider_name, postcode, address, status, registered, beds, rating, rating_date, lat, lon, care_home, service_types):
    return {
        "register": "CQC",
        "register_id": location_id,
        "name": name,
        "provider_id": provider_id,
        "provider_name": provider_name,
        "postcode": norm_postcode(postcode),
        "address": address,
        "status": status,
        "registered_at": registered,
        "capacity": beds,
        "capacity_label": "beds" if beds else None,
        "rating": rating,
        "rating_date": rating_date,
        "lat": lat,
        "lon": lon,
        "extra": {"careHome": care_home, "serviceTypes": service_types},
        "source": "CQC",
        "licence": "OGL",
    }


def parse_api(data) -> Iterator[dict]:
    """One location JSON document or a list of them (as returned by the API or saved from it)."""
    obj = json.loads(text_of(data)) if not isinstance(data, (dict, list)) else data
    items = obj if isinstance(obj, list) else obj.get("locations", [obj])
    for loc in items:
        ratings = (loc.get("currentRatings") or {}).get("overall") or {}
        addr = ", ".join(x for x in (loc.get("postalAddressLine1"), loc.get("postalAddressLine2"), loc.get("postalAddressTownCity")) if x)
        yield _record(
            loc.get("locationId"), loc.get("name"), loc.get("providerId"), loc.get("providerName") or loc.get("brandName"), loc.get("postalCode"), addr,
            loc.get("registrationStatus"), parse_date(loc.get("registrationDate")), to_int(loc.get("numberOfBeds")),
            ratings.get("rating"), parse_date(ratings.get("reportDate")), to_float(loc.get("onspdLatitude")), to_float(loc.get("onspdLongitude")),
            bool(loc.get("careHome") == "Y" or loc.get("numberOfBeds")), [s.get("name") for s in loc.get("gacServiceTypes") or []],
        )


def parse_csv(path) -> Iterator[dict]:
    for row in read_csv(path, ods_sheet="location"):
        location_id = pick(row, "Location ID", contains=("location", "id"))
        if not location_id:
            continue
        beds = to_int(pick(row, "Care homes beds", contains=("beds",)))
        addr = ", ".join(x for x in (pick(row, "Location Street Address"), pick(row, "Location Address Line 2"), pick(row, "Location City")) if x)
        yield _record(
            location_id, pick(row, "Location Name"), pick(row, "Provider ID"), pick(row, "Provider Name"), pick(row, "Location Postal Code", contains=("postal",)), addr,
            "Registered" if (pick(row, "Dormant (Y/N)") or "N").upper() != "Y" else "Dormant", parse_date(pick(row, "Location HSCA start date", contains=("start", "date"))), beds,
            pick(row, "Location Latest Overall Rating", contains=("overall", "rating")), parse_date(pick(row, "Publication Date", contains=("publication",))),
            to_float(pick(row, "Location Latitude", contains=("latitude",))), to_float(pick(row, "Location Longitude", contains=("longitude",))),
            (pick(row, "Care home?") or "N").upper() == "Y", [k.replace("service_type_", "").replace("_", " ") for k, v in row.items() if k.startswith("service_type_") and v == "Y"],
        )
