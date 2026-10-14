"""Snap the national real-business tiles onto Overture building footprints, cell by cell.

For each 0.5 degree places tile (public/data/gb/places/<x>_<y>.json.gz) this extracts the Overture
buildings for the cell's bounding box with HTTP range reads (overture_extract.py), moves every place
that sits inside a footprint, or within SNAP_M metres of one, to that footprint's interior centre,
and rewrites the tile with `placed` ('building' | 'listed') and `orig` ([lon, lat] of the listed point
when it moved). Places that share a footprint share its centre, so the map draws one dot with a count.

A whole-GB run moves roughly 650,000 places and downloads tens of gigabytes of buildings; run it on the
office machine overnight, or pass --cells to do the busy cells first (index.json lists counts).
--bbox limits the work to a window inside the cells (used to prove the pipeline from the sandbox).

Usage:
  python snap_places_national.py --cells=-4_104 -1_103         # named cells (use = because keys start with a minus)
  python snap_places_national.py --all                           # everything in index.json
  python snap_places_national.py --cells=-4_104 --bbox -1.925 52.47 -1.885 52.492
"""
import argparse, gzip, json, math, os, subprocess, sys, tempfile

import pyarrow.parquet as pq
from shapely import affinity, wkb
from shapely.geometry import Point
from shapely.strtree import STRtree

SNAP_M = 30
CELL = 0.5
HERE = os.path.dirname(os.path.abspath(__file__))
GB = os.path.join(HERE, '..', '..', 'public', 'data', 'gb', 'places')


def cell_bbox(key):
    x, y = (int(v) for v in key.split('_'))
    return (x * CELL, y * CELL, (x + 1) * CELL, (y + 1) * CELL)


def extract_buildings(bbox, out_parquet):
    cmd = [sys.executable, os.path.join(HERE, 'overture_extract.py'), 'buildings/building', *[str(v) for v in bbox], out_parquet]
    subprocess.run(cmd, check=True)


def snap_cell(key, bbox=None, parquet=None):
    path = os.path.join(GB, f'{key}.json.gz')
    rows = json.load(gzip.open(path, 'rt', encoding='utf-8'))
    cb = cell_bbox(key)
    box = bbox or cb
    lat0 = (box[1] + box[3]) / 2
    MX, MY = 111_320 * math.cos(math.radians(lat0)), 111_320
    to_m = lambda g: affinity.affine_transform(g, [MX, 0, 0, MY, 0, 0])  # noqa: E731

    if parquet is None:
        tmp = tempfile.NamedTemporaryFile(suffix='.parquet', delete=False)
        tmp.close()
        parquet = tmp.name
        extract_buildings(box, parquet)
    if not os.path.exists(parquet) or os.path.getsize(parquet) == 0:
        print(key, 'no buildings extracted; tile left as listed')
        return 0, 0
    tbl = pq.read_table(parquet, columns=['geometry'])
    polys = []
    for g in tbl.column('geometry').to_pylist():
        try:
            geom = wkb.loads(g)
        except Exception:  # noqa: BLE001
            continue
        if geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            continue
        polys.append(to_m(geom))
    tree = STRtree(polys)
    print(key, 'buildings', len(polys), 'places in tile', len(rows), flush=True)

    assign = {}
    for i, r in enumerate(rows):
        lon, lat = (r.get('orig') or [r['lon'], r['lat']])
        if not (box[0] <= lon <= box[2] and box[1] <= lat <= box[3]):
            continue
        pt = Point(lon * MX, lat * MY)
        hit = next((j for j in tree.query(pt) if polys[j].covers(pt)), None)
        if hit is None:
            cand = [(polys[j].distance(pt), j) for j in tree.query(pt.buffer(SNAP_M))]
            cand = [c for c in cand if c[0] <= SNAP_M]
            if cand:
                hit = min(cand)[1]
        assign[i] = (hit, lon, lat)

    centres = {}
    moved = listed = 0
    for i, (hit, lon, lat) in assign.items():
        r = rows[i]
        if hit is None:
            r['lon'], r['lat'] = round(lon, 6), round(lat, 6)
            r['placed'] = 'listed'
            r.pop('orig', None)
            listed += 1
            continue
        if hit not in centres:
            p = polys[hit].representative_point()
            centres[hit] = (round(p.x / MX, 6), round(p.y / MY, 6))
        nx, ny = centres[hit]
        r['placed'] = 'building'
        if math.hypot((nx - lon) * MX, (ny - lat) * MY) > 2:
            r['orig'] = [round(lon, 6), round(lat, 6)]
            moved += 1
        else:
            r.pop('orig', None)
        r['lon'], r['lat'] = nx, ny
    with gzip.open(path, 'wt', encoding='utf-8', compresslevel=9) as fh:
        json.dump(rows, fh, separators=(',', ':'))
    print(key, 'snapped', moved, 'kept listed', listed, 'of', len(assign), 'in window', flush=True)
    return moved, listed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cells', nargs='*', default=[])
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--bbox', nargs=4, type=float)
    ap.add_argument('--parquet', help='reuse an already extracted buildings parquet (single cell)')
    a = ap.parse_args()
    index = json.load(open(os.path.join(GB, 'index.json')))
    cells = list(index['cells']) if a.all else a.cells
    if not cells:
        ap.error('give --cells or --all')
    cells.sort(key=lambda k: -index['cells'].get(k, 0))
    total_moved = 0
    for k in cells:
        m, _ = snap_cell(k, tuple(a.bbox) if a.bbox else None, a.parquet)
        total_moved += m
    print('done; places moved onto footprints:', total_moved)


if __name__ == '__main__':
    main()
