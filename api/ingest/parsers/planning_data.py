"""planning.data.gov.uk entity API (entity.json) for constraints and planning applications.

Each entity: entity (id), dataset, reference, name, geometry (WKT, WGS84), point (WKT), entry-date,
start-date, end-date, organisation-entity, plus dataset-specific fields. Licence: OGL v3.
"""
from __future__ import annotations

import json
from typing import Iterator

from shapely import wkt
from shapely.geometry import mapping

from ._util import parse_date, text_of

KIND_BY_DATASET = {
    "conservation-area": "Conservation Area",
    "listed-building": "Listed Building",
    "listed-building-outline": "Listed Building",
    "article-4-direction-area": "Article 4",
    "green-belt": "Green Belt",
    "tree-preservation-zone": "TPO",
    "tree-preservation-order": "TPO",
    "flood-risk-zone": "Flood Zone",
    "scheduled-monument": "Scheduled Monument",
    "world-heritage-site": "World Heritage Site",
    "area-of-outstanding-natural-beauty": "AONB",
    "site-of-special-scientific-interest": "SSSI",
    "brownfield-land": "Brownfield",
}


def parse(data) -> Iterator[dict]:
    obj = json.loads(text_of(data)) if not isinstance(data, dict) else data
    for e in obj.get("entities", []):
        geom_wkt = e.get("geometry") or e.get("point")
        if not geom_wkt:
            continue
        g = wkt.loads(geom_wkt)
        ds = e.get("dataset", "")
        yield {
            "id": f"{ds}:{e.get('reference') or e.get('entity')}",
            "entity": e.get("entity"),
            "dataset": ds,
            "kind": KIND_BY_DATASET.get(ds, ds),
            "name": e.get("name") or e.get("reference"),
            "reference": e.get("reference"),
            "grade": e.get("listed-building-grade"),
            "flood_zone": e.get("flood-risk-level"),
            "organisation": e.get("organisation-entity"),
            "entry_date": parse_date(e.get("entry-date")),
            "start_date": parse_date(e.get("start-date")),
            "end_date": parse_date(e.get("end-date")),
            "geometry": mapping(g),
            "source": "planning.data.gov.uk",
            "licence": "OGL",
        }
