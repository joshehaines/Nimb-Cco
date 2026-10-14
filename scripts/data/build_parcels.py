"""Build parcels.geojson for a demo area: real building footprints (Overture) inside the area's
windows, cleaned and annotated with the nearest street, a position along it, the nearest place's
postcode and locality, and the number of places within 25 m. The demo generator seats synthetic
titles on these shapes, so the ownership layer follows the real built form.

Usage: python build_parcels.py <area-id>   (reads public/data/areas.json)
"""
import json, math, os, sys
from shapely.geometry import shape, mapping, box, Point
from shapely.strtree import STRtree
from shapely.ops import nearest_points

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data')
area_id = sys.argv[1]
areas = json.load(open(os.path.join(ROOT, 'areas.json')))['areas']
area = next(a for a in areas if a['id'] == area_id)
lat0 = area['centre'][1]
MX = 111_320 * math.cos(math.radians(lat0))
MY = 111_320
to_m = lambda g: __import__('shapely').affinity.affine_transform(g, [MX, 0, 0, MY, 0, 0])  # noqa: E731

windows = [box(*w) for w in area['windows']]
buildings = json.load(open(os.path.join(ROOT, area['files']['buildings'])))['features']
roads = json.load(open(os.path.join(ROOT, area['files']['roads'])))['features']
places = json.load(open(os.path.join(ROOT, area['files']['places'])))['features']

road_geoms, road_props = [], []
for f in roads:
    if f['properties'].get('class') in ('footway', 'path', 'steps', 'cycleway', 'track', 'bridleway'):
        continue
    g = shape(f['geometry'])
    road_geoms.append(to_m(g)); road_props.append(f['properties'])
road_tree = STRtree(road_geoms)
place_geoms = [to_m(shape(f['geometry'])) for f in places]
place_tree = STRtree(place_geoms)

out = []
seen = set()
for f in buildings:
    g = shape(f['geometry'])
    if g.geom_type == 'MultiPolygon':
        g = max(g.geoms, key=lambda p: p.area)
    if not any(w.intersects(g) for w in windows):
        continue
    gm = to_m(g)
    if gm.area < 20 or not gm.is_valid:
        continue
    gm = gm.simplify(0.4, preserve_topology=True)
    c = gm.centroid
    # nearest named road
    idxs = road_tree.query(c.buffer(80))
    best, bd = None, 1e9
    for i in idxs:
        d = road_geoms[i].distance(c)
        if d < bd and road_props[i].get('name'):
            bd, best = d, i
    if best is None:
        for i in road_tree.query(c.buffer(250)):
            d = road_geoms[i].distance(c)
            if d < bd and road_props[i].get('name'):
                bd, best = d, i
    street = road_props[best]['name'] if best is not None else 'Unnamed road'
    along = round(road_geoms[best].project(c), 1) if best is not None else 0.0
    # side of the road: sign of cross product between road direction and the centroid offset
    side = 1
    if best is not None:
        rg = road_geoms[best]
        p1 = rg.interpolate(max(0, along - 1)); p2 = rg.interpolate(min(rg.length, along + 1))
        cross = (p2.x - p1.x) * (c.y - p1.y) - (p2.y - p1.y) * (c.x - p1.x)
        side = 1 if cross >= 0 else -1
    # nearest place within 300 m for postcode/locality, and places within 25 m for commercial weight
    near = place_tree.query(c.buffer(300))
    pc, loc, nd = None, None, 1e9
    for i in near:
        pr = places[i]['properties']
        d = place_geoms[i].distance(c)
        if d < nd and pr.get('postcode'):
            nd, pc, loc = d, pr.get('postcode'), pr.get('locality')
    pois = sum(1 for i in place_tree.query(gm.buffer(25)) if place_geoms[i].distance(gm) <= 25)
    pid = f['properties'].get('id') or f"b{len(out)}"
    if pid in seen:
        continue
    seen.add(pid)
    # back to lon/lat
    g2 = __import__('shapely').affinity.affine_transform(gm, [1 / MX, 0, 0, 1 / MY, 0, 0])
    geom = mapping(g2)
    geom['coordinates'] = [[[round(x, 6), round(y, 6)] for x, y in ring] for ring in geom['coordinates']]
    out.append({'type': 'Feature', 'geometry': geom, 'properties': {'id': pid, 'street': street, 'along': along, 'side': side, 'postcode': pc, 'locality': loc, 'pois': pois, 'areaSqm': round(gm.area), 'height': f['properties'].get('height'), 'levels': f['properties'].get('levels')}})

path = os.path.join(ROOT, area_id, 'parcels.geojson')
json.dump({'type': 'FeatureCollection', 'features': out}, open(path, 'w'), separators=(',', ':'))
print(area_id, 'parcels', len(out), 'bytes', os.path.getsize(path), 'with pois', sum(1 for f in out if f['properties']['pois']))
