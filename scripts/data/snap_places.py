"""Move each real business pin (Overture place) into the building it belongs to.

Overture places carry the point a listing gives, which is usually the street frontage or the
road itself, so dots line the roads and hide the street network. This step puts each dot at the
centre of the title/building footprint that contains it (or the nearest footprint within
SNAP_M metres). Several places in one footprint (a terrace Overture mapped as one building) are
laid out along its long axis in the order their listed points fall along the frontage, so they
read as units in a row and stay clickable. Places with no footprint nearby keep their listed point.

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
    for f in json.load(open(os.path.join(ROOT, area['files'][key])))['features']:
        g = shape(f['geometry'])
        if g.is_empty or not g.is_valid:
            g = g.buffer(0)
        if g.is_empty:
            continue
        polys.append(to_m(g))
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

# 2) place: one per footprint at its interior centre; several laid out along the footprint's long
#    axis (a terrace's frontage) in the order their listed points fall along it
by_poly = {}
for i, (hit, _) in assign.items():
    if hit is not None:
        by_poly.setdefault(hit, []).append(i)


def axis_points(poly, members):
    """Evenly spaced points along the longest interior run of the footprint's long axis, one per
    member, ordered by where each member's listed point projects onto that axis."""
    from shapely.geometry import LineString
    centre = poly.representative_point()
    mrr = list(poly.minimum_rotated_rectangle.exterior.coords)
    edges = [(math.hypot(mrr[k + 1][0] - mrr[k][0], mrr[k + 1][1] - mrr[k][1]), k) for k in range(4)]
    length, k = max(edges)
    ux, uy = (mrr[k + 1][0] - mrr[k][0]) / length, (mrr[k + 1][1] - mrr[k][1]) / length
    line = LineString([(centre.x - 2000 * ux, centre.y - 2000 * uy), (centre.x + 2000 * ux, centre.y + 2000 * uy)])
    seg = line.intersection(poly)
    pieces = [seg] if seg.geom_type == 'LineString' else [g for g in getattr(seg, 'geoms', []) if g.geom_type == 'LineString']
    pieces = [g for g in pieces if g.length > 0]
    if not pieces:
        return {m: centre for m in members}
    run = max(pieces, key=lambda g: g.length)
    order = sorted(members, key=lambda m: assign[m][1][0] * MX * ux + assign[m][1][1] * MY * uy)
    n = len(order)
    return {m: run.interpolate((j + 0.5) / n, normalized=True) for j, m in enumerate(order)}


placement = {}
for hit, members in by_poly.items():
    poly = polys[hit]
    if len(members) == 1:
        placement[members[0]] = poly.representative_point()
    else:
        placement.update(axis_points(poly, members))

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
