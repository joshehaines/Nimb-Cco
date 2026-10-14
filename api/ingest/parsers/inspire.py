"""HM Land Registry INSPIRE Index Polygons (GML 3.2, EPSG:27700, one file per local authority).

Each gml:featureMember holds an INSPIREID, a LABEL, NATIONALCADASTRALREFERENCE, VALIDFROM and a
gml:Polygon whose posList is British National Grid eastings/northings. The polygon is reprojected
to WGS84 lon/lat. Licence: OGL v3 with the required Ordnance Survey attribution.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Iterator

from pyproj import Transformer

from ._util import parse_date, text_of

_BNG_TO_WGS84 = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].upper()


def _find(el, name: str):
    for e in el.iter():
        if _local(e.tag) == name.upper():
            return e
    return None


def parse(path) -> Iterator[dict]:
    root = ET.fromstring(text_of(path))
    for member in root.iter():
        if _local(member.tag) not in ("FEATUREMEMBER", "MEMBER"):
            continue
        inspire_id = _find(member, "INSPIREID")
        poslist = _find(member, "posList")
        if inspire_id is None or poslist is None or not poslist.text:
            continue
        nums = [float(x) for x in poslist.text.split()]
        dim = 3 if poslist.get("srsDimension") == "3" else 2
        ring = []
        for i in range(0, len(nums) - dim + 1, dim):
            lon, lat = _BNG_TO_WGS84.transform(nums[i], nums[i + 1])
            ring.append([round(lon, 7), round(lat, 7)])
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        label = _find(member, "LABEL")
        ncr = _find(member, "NATIONALCADASTRALREFERENCE")
        valid = _find(member, "VALIDFROM")
        yield {
            "inspire_id": int(inspire_id.text.strip()),
            "label": label.text.strip() if label is not None and label.text else None,
            "national_cadastral_reference": ncr.text.strip() if ncr is not None and ncr.text else None,
            "valid_from": parse_date(valid.text) if valid is not None else None,
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "source": "HMLR INSPIRE",
            "licence": "OGL",
        }
