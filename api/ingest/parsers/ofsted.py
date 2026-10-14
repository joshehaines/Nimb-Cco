"""Ofsted registered childcare providers (monthly CSV from the 'Childcare providers and inspections' release).

Columns vary slightly between releases, so headers are matched by tokens: Provider URN, Provider name,
Provider type, Provider status, Setting name, Registration date, Places, Postcode, Local authority,
Most recent inspection date, Overall effectiveness, Registered person name. Licence: OGL v3.
"""
from __future__ import annotations

from typing import Iterator

from ._util import norm_postcode, parse_date, pick, read_csv, to_int


def parse(path) -> Iterator[dict]:
    for row in read_csv(path):
        urn = pick(row, "Provider URN", "URN", contains=("urn",))
        if not urn:
            continue
        places = to_int(pick(row, "Places", "Registered places", contains=("places",)))
        yield {
            "register": "Ofsted",
            "register_id": urn,
            "name": pick(row, "Setting name", "Provider name", contains=("name",)),
            "provider_name": pick(row, "Registered person name", "Provider name"),
            "provider_id": pick(row, "Registered person URN"),
            "provider_type": pick(row, "Provider type", contains=("provider", "type")),
            "status": pick(row, "Provider status", contains=("status",)) or "Active",
            "registered_at": parse_date(pick(row, "Registration date", contains=("registration", "date"))),
            "capacity": places,
            "capacity_label": "places" if places else None,
            "rating": pick(row, "Overall effectiveness", contains=("overall",)),
            "rating_date": parse_date(pick(row, "Most recent inspection date", "Inspection date", contains=("inspection", "date"))),
            "postcode": norm_postcode(pick(row, "Postcode", contains=("postcode",))),
            "local_authority": pick(row, "Local authority", contains=("local", "authority")),
            "extra": {"subtype": pick(row, "Provider subtype")},
            "source": "Ofsted",
            "licence": "OGL",
        }
