"""planning.data.gov.uk entities: the entity.json API response or the bulk dataset CSV.

Each entity: entity (id), dataset, reference, name, geometry (WKT, WGS84), point (WKT), entry-date,
start-date, end-date, organisation-entity, plus dataset-specific fields. The bulk files at
https://files.planning.data.gov.uk/dataset/<dataset>.csv carry the same columns (hyphenated headers),
so one parser serves both. Licence: OGL v3.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

from shapely import wkt
from shapely.errors import ShapelyError
from shapely.geometry import mapping

from ._util import parse_date, read_csv, text_of

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
    "national-park": "National Park",
    "site-of-special-scientific-interest": "SSSI",
    "ancient-woodland": "Ancient Woodland",
    "brownfield-land": "Brownfield Register",
}


def _get(e: dict, key: str):
    v = e.get(key)
    if v in (None, ""):
        v = e.get(key.replace("-", "_"))
    return v if v != "" else None


def _entity(e: dict) -> dict | None:
    geom_wkt = _get(e, "geometry") or _get(e, "point")
    if not geom_wkt:
        return None
    try:
        g = wkt.loads(geom_wkt)
    except (ShapelyError, ValueError):
        return None
    if g.is_empty:
        return None
    ds = _get(e, "dataset") or ""
    kind = KIND_BY_DATASET.get(ds, ds)
    if ds == "flood-risk-zone":
        level = str(_get(e, "flood-risk-level") or "").strip()
        kind = f"Flood Zone {level}" if level in ("2", "3") else "Flood Zone"
    return {
        "id": f"{ds}:{_get(e, 'reference') or _get(e, 'entity')}",
        "entity": _get(e, "entity"),
        "dataset": ds,
        "kind": kind,
        "name": _get(e, "name") or _get(e, "reference"),
        "reference": _get(e, "reference"),
        "grade": _get(e, "listed-building-grade"),
        "flood_zone": _get(e, "flood-risk-level"),
        "organisation": _get(e, "organisation-entity"),
        "entry_date": parse_date(_get(e, "entry-date")),
        "start_date": parse_date(_get(e, "start-date")),
        "end_date": parse_date(_get(e, "end-date")),
        "geometry": mapping(g),
        "source": "planning.data.gov.uk",
        "licence": "OGL",
    }


def parse(data) -> Iterator[dict]:
    if isinstance(data, dict):
        entities = data.get("entities", [])
    else:
        name = str(getattr(data, "name", data)).lower()
        if name.endswith(".csv") or (isinstance(data, (str, Path)) and Path(data).is_dir()):
            entities = read_csv(data)
        else:
            entities = json.loads(text_of(data)).get("entities", [])
    for e in entities:
        rec = _entity(e)
        if rec:
            yield rec
