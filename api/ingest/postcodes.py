"""Postcode centroids (OS Code-Point Open).

Source: https://osdatahub.os.uk/downloads/open/CodePointOpen
Cadence: quarterly
Notes: OS OpenData under the OGL ("Contains OS data © Crown copyright and database right"). About 1.7 million
current GB postcodes with a British National Grid centroid; the load transforms to WGS84 in PostGIS and
fills postcode_centroids (method 'codepoint-open'), then geocodes every register_records and
planning_applications row that has a postcode but no point. Step 1 download: codepo_gb.zip, fetched here
when it is not already in the work directory (no account needed).
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterator

from .base import download, writable_dir
from .parsers._util import iter_inputs, norm_postcode

SOURCE_URL = "https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect"
CADENCE = "quarterly"
LICENCE = "OGL"
ATTRIBUTION = "Contains OS data © Crown copyright and database right"


def fetch(workdir: Path) -> Path:
    existing = sorted(p for p in workdir.glob("codepo_gb*.zip") if p.stat().st_size > 0)
    if existing:
        return existing[-1]
    return download(SOURCE_URL, writable_dir(workdir, "postcodes"), "codepo_gb.zip")


def parse(path) -> Iterator[tuple[str, int, int, int]]:
    """(postcode, positional quality, easting, northing) for every row with coordinates.

    Code-Point Open ships one header-less CSV per postcode area under Data/CSV; the Doc folder holds
    column headers and code lists, which are skipped. Quality indicator 90 means no coordinates.
    """
    for name, f in iter_inputs(path, (".csv",), exclude=("doc/", "docs/", "column_headers", "codelist")):
        for cells in csv.reader(f):
            if len(cells) < 4:
                continue
            pc = norm_postcode(cells[0])
            try:
                pqi, e, n = int(cells[1] or 0), int(float(cells[2])), int(float(cells[3]))
            except ValueError:
                continue
            if not pc or pqi >= 90 or (e == 0 and n == 0):
                continue
            yield pc, pqi, e, n


UPSERT = """insert into postcode_centroids (postcode, geom, method, samples)
    values ($1, ST_Transform(ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 27700), 4326), 'codepoint-open', $4)
    on conflict (postcode) do update set geom = excluded.geom, method = excluded.method, samples = excluded.samples"""

GEOCODE = (
    "update register_records r set geom = c.geom from postcode_centroids c where r.geom is null and r.postcode = c.postcode",
    "update planning_applications p set geom = c.geom from postcode_centroids c where p.geom is null and p.postcode = c.postcode",
)


async def load(conn, path: Path) -> int:
    from ._upsert import Batcher

    b = Batcher(conn, UPSERT, size=5000)
    seen: set[str] = set()
    for pc, pqi, e, n in parse(path):
        if pc in seen:
            await b.flush()
            seen.clear()
        seen.add(pc)
        await b.add(pc, e, n, pqi)
    await b.flush()
    for sql in GEOCODE:
        await conn.execute(sql)
    return b.count


def diff(conn) -> int:
    return 0
