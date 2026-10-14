"""Build traffic.json, price_paid.json and postcodes.json for the demo area.

Usage: python build_warwick.py <raw_dir> [minlon minlat maxlon maxlat] [district]
raw_dir must contain dft_traffic_counts_aadf.csv (unzipped DfT download), pp-YYYY.csv
(HM Land Registry yearly files) and places.parquet (Overture extract).
"""
import collections, glob, json, os, sys
import pandas as pd
import pyarrow.parquet as pq
from shapely import wkb

raw = sys.argv[1]
minlon, minlat, maxlon, maxlat = map(float, sys.argv[2:6]) if len(sys.argv) >= 6 else (-1.63, 52.25, -1.49, 52.36)
district = sys.argv[6] if len(sys.argv) >= 7 else 'WARWICK'
out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'warwick')
os.makedirs(out, exist_ok=True)

# DfT: latest year per count point in the area, with history
df = pd.read_csv(os.path.join(raw, 'dft_traffic_counts_aadf.csv'), low_memory=False)
area = df[df.longitude.between(minlon, maxlon) & df.latitude.between(minlat, maxlat)]
traffic = []
for cp, g in area.groupby('count_point_id'):
    g = g.sort_values('year')
    last = g.iloc[-1]
    cat = str(last.road_category)
    traffic.append({
        'countPointId': str(int(cp)), 'roadName': str(last.road_name), 'roadType': 'Major' if cat.startswith(('P', 'T', 'M')) and cat not in ('MB', 'MCU') else 'Minor', 'roadCategory': cat,
        'startJunction': None if pd.isna(last.start_junction_road_name) else str(last.start_junction_road_name), 'endJunction': None if pd.isna(last.end_junction_road_name) else str(last.end_junction_road_name),
        'localAuthority': str(last.local_authority_name), 'lon': round(float(last.longitude), 6), 'lat': round(float(last.latitude), 6), 'year': int(last.year),
        'method': 'Counted' if str(last.estimation_method).lower().startswith('count') else 'Estimated',
        'aadf': int(last.all_motor_vehicles), 'cars': int(last.cars_and_taxis), 'lgv': int(last.LGVs), 'hgv': int(last.all_HGVs), 'buses': int(last.buses_and_coaches), 'pedalCycles': int(last.pedal_cycles),
        'history': [{'year': int(r.year), 'aadf': int(r.all_motor_vehicles)} for r in g.itertuples()],
    })
json.dump(traffic, open(os.path.join(out, 'traffic.json'), 'w'), separators=(',', ':'))
print('traffic points', len(traffic))

# Postcode centroids from Overture place addresses (approximate geocoder)
pcs = collections.defaultdict(list)
for r in pq.read_table(os.path.join(raw, 'places.parquet')).to_pylist():
    a = (r.get('addresses') or [None])[0] or {}
    pc = (a.get('postcode') or '').upper().strip()
    if len(pc) < 6 or ' ' not in pc:
        continue
    g = wkb.loads(r['geometry'])
    pcs[pc].append((g.x, g.y))
cent = {pc: (round(sum(x for x, _ in v) / len(v), 6), round(sum(y for _, y in v) / len(v), 6)) for pc, v in pcs.items()}
sectors = collections.defaultdict(list)
for pc, xy in cent.items():
    sectors[pc[:-2]].append(xy)
sec = {s: (round(sum(x for x, _ in v) / len(v), 6), round(sum(y for _, y in v) / len(v), 6)) for s, v in sectors.items()}
json.dump({'postcodes': {k: list(v) for k, v in cent.items()}, 'sectors': {k: list(v) for k, v in sec.items()}, 'note': 'Approximate centroids derived from Overture Maps place addresses; not ONS postcode centroids.'}, open(os.path.join(out, 'postcodes.json'), 'w'), separators=(',', ':'))
print('postcodes', len(cent), 'sectors', len(sec))

# HM Land Registry price paid for the district
cols = ['transaction_id', 'price', 'date', 'postcode', 'property_type', 'new_build', 'duration', 'paon', 'saon', 'street', 'locality', 'town', 'district', 'county', 'ppd_category', 'record_status']
rows = []
for f in sorted(glob.glob(os.path.join(raw, 'pp-20*.csv'))):
    d = pd.read_csv(f, header=None, names=cols, dtype=str).fillna('')
    d = d[d.district.eq(district)]
    for r in d.itertuples():
        pc = r.postcode.strip().upper()
        if pc in cent:
            lon, lat = cent[pc]; how = 'postcode'
        elif pc[:-2] in sec:
            lon, lat = sec[pc[:-2]]; how = 'sector'
        else:
            lon = lat = how = None
        rows.append({'id': r.transaction_id.strip('{}'), 'price': int(r.price), 'date': r.date[:10], 'postcode': pc, 'type': r.property_type, 'newBuild': r.new_build == 'Y', 'tenure': 'Freehold' if r.duration == 'F' else 'Leasehold',
                     'address': ' '.join(x for x in [r.saon, r.paon, r.street] if x).title(), 'locality': r.locality.title(), 'town': r.town.title(), 'category': r.ppd_category, 'lon': lon, 'lat': lat, 'geocode': how})
json.dump(rows, open(os.path.join(out, 'price_paid.json'), 'w'), separators=(',', ':'))
print('price paid rows', len(rows))
