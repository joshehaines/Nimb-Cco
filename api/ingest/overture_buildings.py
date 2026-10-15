"""Overture Maps building footprints.

Source: https://overturemaps.org/
Cadence: quarterly
Notes: Streams theme=buildings/type=building GeoParquet from the public Overture release on S3 with HTTP range
reads (no credentials): every parquet file's row groups carry bbox statistics, so only the groups that touch the
British Isles are downloaded, each exactly once, filtered to the bbox and upserted into `buildings`. Progress is
recorded per (file, row group) in the writable state directory so a stopped run resumes. ODbL (OpenStreetMap
contributors, Microsoft and Google Open Buildings via Overture); the buildings table carries that licence note.
Afterwards run `select snap_places_to_buildings()` so place pins sit on footprints.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterator

from .base import writable_dir

SOURCE_URL = "https://overturemaps.org/"
CADENCE = "quarterly"
LICENCE = "OGL"   # licence_class has no ODbL member; the row's source text names the ODbL terms
RELEASE = "2026-09-23.1"
BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
PREFIX = f"release/{RELEASE}/theme=buildings/type=building/"
# British Isles: Great Britain, Northern Ireland and (unavoidably, by bbox) the Republic of Ireland.
BBOX = (-10.7, 49.8, 1.9, 60.9)
BATCH = 2000
SOURCE_TEXT = "Overture Maps buildings (ODbL, OpenStreetMap contributors and others)"


def list_keys(prefix: str = PREFIX) -> list[str]:
    keys, token = [], None
    while True:
        url = f"{BUCKET}/?list-type=2&prefix={prefix}" + (f"&continuation-token={urllib.parse.quote(token)}" if token else "")
        root = ET.fromstring(urllib.request.urlopen(url, timeout=60).read())
        ns = {"s3": root.tag.split("}")[0].strip("{")}
        keys += [c.find("s3:Key", ns).text for c in root.findall("s3:Contents", ns)]
        if root.find("s3:IsTruncated", ns).text != "true":
            return [k for k in keys if k.endswith(".parquet")]
        token = root.find("s3:NextContinuationToken", ns).text


def groups_touching(pf, bbox: tuple[float, float, float, float]) -> list[int]:
    """Row groups whose bbox statistics intersect `bbox` (groups without statistics are kept)."""
    minlon, minlat, maxlon, maxlat = bbox
    idx = {}
    for j in range(pf.metadata.num_columns):
        path = pf.metadata.schema.column(j).path
        if path.startswith("bbox."):
            idx[path.split(".")[1]] = j
    out = []
    for g in range(pf.metadata.num_row_groups):
        rg = pf.metadata.row_group(g)
        sx, sy, ex, ey = (rg.column(idx[k]).statistics for k in ("xmin", "ymin", "xmax", "ymax"))
        if sx is None or not sx.has_min_max:
            out.append(g)
        elif sx.min <= maxlon and ex.max >= minlon and sy.min <= maxlat and ey.max >= minlat:
            out.append(g)
    return out


def rows_in_bbox(table, bbox: tuple[float, float, float, float]) -> Iterator[tuple]:
    """(id, name, class, subtype, height, levels, wkb) for every row of an Overture buildings table inside `bbox`."""
    import pyarrow.compute as pc

    minlon, minlat, maxlon, maxlat = bbox
    b = table.column("bbox")
    mask = pc.and_(pc.and_(pc.less_equal(pc.struct_field(b, "xmin"), maxlon), pc.greater_equal(pc.struct_field(b, "xmax"), minlon)),
                   pc.and_(pc.less_equal(pc.struct_field(b, "ymin"), maxlat), pc.greater_equal(pc.struct_field(b, "ymax"), minlat)))
    t = table.filter(mask)
    if not t.num_rows:
        return
    cols = {n: t.column(n).to_pylist() for n in ("id", "class", "subtype", "height", "num_floors", "geometry") if n in t.column_names}
    names = t.column("names").to_pylist() if "names" in t.column_names else [None] * t.num_rows
    for i in range(t.num_rows):
        nm = names[i] or {}
        levels = cols.get("num_floors", [None] * t.num_rows)[i]
        height = cols.get("height", [None] * t.num_rows)[i]
        yield (cols["id"][i], (nm.get("primary") if isinstance(nm, dict) else None), cols.get("class", [None] * t.num_rows)[i], cols.get("subtype", [None] * t.num_rows)[i],
               float(height) if height is not None else None, int(levels) if levels is not None else None, cols["geometry"][i])


UPSERT = """insert into buildings (building_id, name, class, subtype, height_m, levels, geom, source)
    values ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_GeomFromWKB($7), 4326), $8)
    on conflict (building_id) do update set name = excluded.name, class = excluded.class, subtype = excluded.subtype, height_m = excluded.height_m, levels = excluded.levels, geom = excluded.geom, fetched_at = now()"""


def fetch(workdir: Path) -> Path:
    return writable_dir(workdir, "overture_buildings") / "overture_buildings"


async def load(conn, path: Path) -> int:
    import fsspec
    import pyarrow.parquet as pq

    from ._upsert import Batcher

    path.mkdir(parents=True, exist_ok=True)
    state_file, keys_file = path / "done.txt", path / "keys.json"
    done = set(state_file.read_text().split()) if state_file.exists() else set()
    if keys_file.exists():
        keys = json.loads(keys_file.read_text())
    else:
        keys = list_keys()
        keys_file.write_text(json.dumps(keys))
    print(f"overture_buildings: {len(keys)} parquet files in the release, {len(done)} row groups already done", flush=True)
    fs = fsspec.filesystem("http", client_kwargs={"trust_env": True}, block_size=8 * 1024 * 1024)
    b = Batcher(conn, UPSERT, size=BATCH)
    t0, files_touched = time.time(), 0
    for i, key in enumerate(keys):
        try:
            with fs.open(f"{BUCKET}/{key}", "rb") as f:
                pf = pq.ParquetFile(f)
                groups = [g for g in groups_touching(pf, BBOX) if f"{key}:{g}" not in done]
                if not groups:
                    continue
                files_touched += 1
                for g in groups:
                    n_before = b.count + len(b.rows)
                    for row in rows_in_bbox(pf.read_row_group(g), BBOX):
                        await b.add(*row, SOURCE_TEXT)
                    await b.flush()
                    with state_file.open("a") as sf:
                        sf.write(f"{key}:{g}\n")
                    print(f"[{i + 1}/{len(keys)}] {key.rsplit('/', 1)[-1][:28]} group {g}: +{b.count - n_before} rows, total {b.count}, {time.time() - t0:.0f}s", flush=True)
        except Exception as e:  # noqa: BLE001  one bad file must not end a multi-hour run; it is retried next run
            print(f"[{i + 1}/{len(keys)}] ERROR {key}: {e}", flush=True)
    await b.flush()
    await conn.execute("analyze buildings")
    print(f"overture_buildings: {b.count} footprints upserted from {files_touched} files in {time.time() - t0:.0f}s", flush=True)
    return b.count


def diff(conn) -> int:
    return 0
