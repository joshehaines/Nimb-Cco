"""Move each real business pin (Overture place) into the building it belongs to.

Overture places carry the point a listing gives, which is usually the street frontage or the
road itself, so dots line the roads and hide the street network. This step puts each dot at the
centre of the title/building footprint that contains it (or the nearest footprint within
SNAP_M metres). Several places in one footprint (a terrace Overture mapped as one building) share
that centre; the map draws them as one dot with a count and the panel lists them. Places with no footprint nearby keep their listed point.

Properties added: `placed` = 'building' | 'listed', and `orig` = [lon, lat] of the listed point
when the pin moved more than 2 m, so the info panel can say so.

Usage: python snap_places.py <area-id>   (reads public/data/areas.json, rewrites places.geojson)
"""
import json, math, os, sys
from shapely import affinity
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

SNAP_M = 30
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data')
area_id = sys.argv[1]
areas = json.load(open(os.path.join(ROOT, 'areas.json')))['areas']
area = next(a for a in areas if a['id'] == area_id)
lat0 = area['centre'][1]
MX = 111_320 * math.cos(math.radians(lat0))
MY = 111_320
to_m = lambda g: affinity.affine_transform(g, [MX, 0, 0, MY, 0, 0])  # noqa: E731
to_deg = lambda x, y: (x / MX, y / MY)  # noqa: E731

places_path = os.path.join(ROOT, area['files']['places'])
places = json.load(open(places_path))
# Title footprints first (what the ownership layer draws), then any other building footprint.
polys, src = [], []
for key in ('parcels', 'buildings'):
    if key not in area['files']:
        continue
    # parcels are cleaned copies of the buildings: skip a building whose centre already lies in a parcel,
    # otherwise two near-identical footprints give two centres a metre apart and split one building's pins
    parcel_tree = STRtree(polys) if key == 'buildings' and polys else None
    for f in json.load(open(os.path.join(ROOT, area['files'][key])))['features']:
        g = shape(f['geometry'])
        if g.is_empty or not g.is_valid:
            g = g.buffer(0)
        if g.is_empty:
            continue
        gm = to_m(g)
        if parcel_tree is not None:
            rp = gm.representative_point()
            if any(polys[j].covers(rp) for j in parcel_tree.query(rp)):
                continue
        polys.append(gm)
        src.append(key)
tree = STRtree(polys)

# 1) assign each place to a footprint
assign = {}
for i, f in enumerate(places['features']):
    lon, lat = f['geometry']['coordinates']
    # a listed point is the pin unless it already came from a footprint on a previous run
    if f['properties'].get('orig'):
        lon, lat = f['properties']['orig']
    pt = Point(lon * MX, lat * MY)
    hit = None
    for j in tree.query(pt):
        if polys[j].covers(pt):
            hit = j
            break
    if hit is None:
        cand = [(polys[j].distance(pt), j) for j in tree.query(pt.buffer(SNAP_M))]
        cand = [c for c in cand if c[0] <= SNAP_M]
        if cand:
            # prefer a title footprint over a bare building when both are within reach
            cand.sort(key=lambda c: (0 if src[c[1]] == 'parcels' else 1, c[0]))
            hit = cand[0][1]
    assign[i] = (hit, (lon, lat))

# 2) place: every place at its footprint's interior centre
by_poly = {}
for i, (hit, _) in assign.items():
    if hit is not None:
        by_poly.setdefault(hit, []).append(i)


placement = {}
for hit, members in by_poly.items():
    poly = polys[hit]
    # every place in the footprint sits at its interior centre; the map draws one dot with a count
    centre = poly.representative_point()
    for m in members:
        placement[m] = centre

moved = listed = 0
for i, f in enumerate(places['features']):
    hit, (lon0, lat0_) = assign[i]
    props = f['properties']
    if hit is None:
        f['geometry']['coordinates'] = [round(lon0, 6), round(lat0_, 6)]
        props['placed'] = 'listed'
        props.pop('orig', None)
        listed += 1
        continue
    p = placement[i]
    x, y = to_deg(p.x, p.y)
    f['geometry']['coordinates'] = [round(x, 6), round(y, 6)]
    props['placed'] = 'building'
    if math.hypot(p.x - lon0 * MX, p.y - lat0_ * MY) > 2:
        props['orig'] = [round(lon0, 6), round(lat0_, 6)]
        moved += 1
    else:
        props.pop('orig', None)

json.dump(places, open(places_path, 'w'), separators=(',', ':'))
print(area_id, 'places', len(places['features']), 'in footprint', len(places['features']) - listed, 'moved', moved, 'kept listed point', listed, 'bytes', os.path.getsize(places_path))
