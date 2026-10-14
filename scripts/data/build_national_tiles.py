"""Build the Great Britain tile set under public/data/gb from the national downloads.

Tiles are 0.5 degree cells named "<lon_index>_<lat_index>.json.gz" (gzipped JSON arrays) (index = floor(coord / 0.5)).
Each theme has an index.json listing cells with feature counts so the app can skip empty ones.

  places/      Overture places in Christie sectors (CDLA-Permissive-2.0)
  price_paid/  HM Land Registry transactions of property type O (non-residential or mixed),
               2023 onwards, geocoded to postcode centroids derived from place addresses (OGL)
  traffic/     DfT AADF count points, latest year with history (OGL)

Usage: python build_national_tiles.py <places_gb.parquet> <dft_aadf.csv> <ppd_dir_with_pp-YYYY.csv> [from_year]
"""
import collections, glob, gzip, json, os, sys
import pandas as pd
import pyarrow.parquet as pq
from shapely import wkb

sys.path.insert(0, os.path.dirname(__file__))
from overture_to_geojson import sector_for  # noqa: E402

CELL = 0.5
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'gb')


def cell_key(lon, lat):
    return f"{int(lon // CELL)}_{int(lat // CELL)}"


def write_theme(name, rows_by_cell):
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, '*.json')) + glob.glob(os.path.join(d, '*.json.gz')):
        os.remove(f)
    index = {}
    for key, rows in rows_by_cell.items():
        with gzip.open(os.path.join(d, f'{key}.json.gz'), 'wt', encoding='utf-8', compresslevel=9) as fh:
            json.dump(rows, fh, separators=(',', ':'))
        index[key] = len(rows)
    json.dump({'cell': CELL, 'cells': index, 'total': sum(index.values())}, open(os.path.join(d, 'index.json'), 'w'), separators=(',', ':'))
    print(name, 'cells', len(index), 'rows', sum(index.values()), 'bytes', sum(os.path.getsize(f) for f in glob.glob(os.path.join(d, '*.json.gz'))))


def main():
    places_pq, dft_csv, ppd_dir = sys.argv[1:4]
    from_year = int(sys.argv[4]) if len(sys.argv) > 4 else 2023

    # ---- places and postcode centroids
    places_by_cell = collections.defaultdict(list)
    pcs = collections.defaultdict(list)
    t = pq.read_table(places_pq, columns=['id', 'geometry', 'confidence', 'names', 'addresses', 'taxonomy', 'websites', 'phones', 'brand'])
    for batch in t.to_batches(50_000):
        for r in batch.to_pylist():
            g = wkb.loads(r['geometry'])
            if g.geom_type != 'Point':
                g = g.centroid
            a = (r.get('addresses') or [None])[0] or {}
            pc = (a.get('postcode') or '').upper().strip()
            if len(pc) >= 6 and ' ' in pc:
                pcs[pc].append((g.x, g.y))
            tax = r.get('taxonomy') or {}
            sector = sector_for(tax.get('primary'), tax.get('hierarchy'))
            if not sector:
                continue
            places_by_cell[cell_key(g.x, g.y)].append({
                'id': r['id'], 'lon': round(g.x, 6), 'lat': round(g.y, 6), 'name': (r.get('names') or {}).get('primary'), 'category': tax.get('primary'), 'sector': sector,
                'confidence': round(r.get('confidence') or 0, 2), 'address': a.get('freeform'), 'postcode': pc or None, 'locality': a.get('locality'),
                'website': (r.get('websites') or [None])[0], 'phone': (r.get('phones') or [None])[0], 'brand': ((r.get('brand') or {}).get('names') or {}).get('primary'),
            })
    write_theme('places', places_by_cell)
    cent = {pc: (round(sum(x for x, _ in v) / len(v), 6), round(sum(y for _, y in v) / len(v), 6)) for pc, v in pcs.items()}
    sectors = collections.defaultdict(list)
    for pc, xy in cent.items():
        sectors[pc[:-2]].append(xy)
    sec = {s: (round(sum(x for x, _ in v) / len(v), 6), round(sum(y for _, y in v) / len(v), 6)) for s, v in sectors.items()}
    print('postcodes', len(cent), 'sectors', len(sec))

    # ---- price paid, non-residential, geocoded
    cols = ['transaction_id', 'price', 'date', 'postcode', 'property_type', 'new_build', 'duration', 'paon', 'saon', 'street', 'locality', 'town', 'district', 'county', 'ppd_category', 'record_status']
    ppd_by_cell = collections.defaultdict(list)
    geo = collections.Counter()
    for f in sorted(glob.glob(os.path.join(ppd_dir, 'pp-20*.csv'))):
        year = int(os.path.basename(f)[3:7])
        if year < from_year:
            continue
        d = pd.read_csv(f, header=None, names=cols, dtype=str).fillna('')
        d = d[d.property_type.eq('O')]
        for r in d.itertuples():
            pc = r.postcode.strip().upper()
            if pc in cent:
                lon, lat = cent[pc]; how = 'postcode'
            elif pc[:-2] in sec:
                lon, lat = sec[pc[:-2]]; how = 'sector'
            else:
                geo[None] += 1
                continue
            geo[how] += 1
            ppd_by_cell[cell_key(lon, lat)].append({'id': r.transaction_id.strip('{}'), 'price': int(r.price), 'date': r.date[:10], 'postcode': pc, 'type': 'O', 'newBuild': r.new_build == 'Y', 'tenure': 'Freehold' if r.duration == 'F' else 'Leasehold',
                                                   'address': ' '.join(x for x in [r.saon, r.paon, r.street] if x).title(), 'locality': r.locality.title(), 'town': r.town.title(), 'district': r.district.title(), 'category': r.ppd_category, 'lon': lon, 'lat': lat, 'geocode': how})
    print('price paid geocoding', dict(geo))
    write_theme('price_paid', ppd_by_cell)

    # ---- traffic
    df = pd.read_csv(dft_csv, low_memory=False)
    tr_by_cell = collections.defaultdict(list)
    for cp, g in df.groupby('count_point_id'):
        g = g.sort_values('year')
        last = g.iloc[-1]
        if pd.isna(last.longitude) or pd.isna(last.latitude):
            continue
        cat = str(last.road_category)
        tr_by_cell[cell_key(float(last.longitude), float(last.latitude))].append({
            'countPointId': str(int(cp)), 'roadName': str(last.road_name), 'roadType': 'Major' if cat.startswith(('P', 'T', 'M')) and cat not in ('MB', 'MCU') else 'Minor', 'roadCategory': cat,
            'startJunction': None if pd.isna(last.start_junction_road_name) else str(last.start_junction_road_name), 'endJunction': None if pd.isna(last.end_junction_road_name) else str(last.end_junction_road_name),
            'localAuthority': str(last.local_authority_name), 'lon': round(float(last.longitude), 6), 'lat': round(float(last.latitude), 6), 'year': int(last.year),
            'method': 'Counted' if str(last.estimation_method).lower().startswith('count') else 'Estimated',
            'aadf': int(last.all_motor_vehicles), 'cars': int(last.cars_and_taxis), 'lgv': int(last.LGVs), 'hgv': int(last.all_HGVs), 'buses': int(last.buses_and_coaches), 'pedalCycles': int(last.pedal_cycles),
            'history': [{'year': int(r.year), 'aadf': int(r.all_motor_vehicles)} for r in g.itertuples()],
        })
    write_theme('traffic', tr_by_cell)


if __name__ == '__main__':
    main()
