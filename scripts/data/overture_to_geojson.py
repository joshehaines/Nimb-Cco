"""Convert an Overture extract (parquet with WKB geometry) to compact GeoJSON.

Usage: python overture_to_geojson.py <places|segments|buildings> <in.parquet> <out.geojson> [minlon minlat maxlon maxlat]
"""
import json, sys
import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import mapping, box

SECTOR_MAP = {  # Overture taxonomy primary -> Christie & Co sector
    'pub': 'Pub', 'gastropub': 'Pub', 'bar': 'Pub', 'beer_bar': 'Pub', 'wine_bar': 'Pub', 'cocktail_bar': 'Pub', 'tapas_bar': 'Pub',
    'hotel': 'Hotel', 'bed_and_breakfast': 'Hotel', 'inn': 'Hotel', 'guest_house': 'Hotel', 'motel': 'Hotel', 'resort': 'Hotel',
    'retirement_home': 'Care Home', 'assisted_living_facility': 'Care Home', 'nursing_home': 'Care Home', 'senior_living_facility': 'Care Home', 'hospice': 'Care Home',
    'preschool': 'Childcare', 'day_care_preschool': 'Childcare', 'child_care_and_day_care': 'Childcare', 'nursery_school': 'Childcare',
    'general_dentistry': 'Dental', 'dentist': 'Dental', 'orthodontist': 'Dental', 'cosmetic_dentist': 'Dental', 'pediatric_dentist': 'Dental', 'oral_surgeon': 'Dental', 'endodontist': 'Dental', 'periodontist': 'Dental',
    'doctors_office': 'Medical', 'family_practice': 'Medical', 'medical_center': 'Medical', 'walk_in_clinic': 'Medical', 'urgent_care_clinic': 'Medical', 'general_practitioner': 'Medical', 'veterinarian': 'Medical', 'animal_hospital': 'Medical',
    'pharmacy': 'Pharmacy', 'drugstore': 'Pharmacy',
    'convenience_store': 'Convenience Retail', 'grocery_store': 'Convenience Retail', 'supermarket': 'Convenience Retail', 'gas_station': 'Convenience Retail', 'off_licence': 'Convenience Retail', 'newsagent': 'Convenience Retail', 'post_office': 'Convenience Retail',
    'gym': 'Leisure', 'sport_or_fitness_facility': 'Leisure', 'cinema': 'Leisure', 'movie_theater': 'Leisure', 'bowling_alley': 'Leisure', 'golf_course': 'Leisure', 'swimming_pool': 'Leisure', 'fitness_trainer': 'Leisure', 'yoga_studio': 'Leisure', 'health_club': 'Leisure', 'amusement_park': 'Leisure', 'soft_play': 'Leisure',
    'nursery_and_gardening_store': 'Garden Centre', 'garden_center': 'Garden Centre', 'plant_nursery': 'Garden Centre',
}
RESTAURANT_WORDS = ('restaurant', 'cafe', 'casual_eatery', 'coffee_shop', 'bistro', 'brasserie', 'steakhouse', 'pizzeria', 'takeaway', 'fast_food')
ROAD_CLASSES = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian', 'service'}


def sector_for(primary, hierarchy):
    if not primary:
        return None
    if primary in SECTOR_MAP:
        return SECTOR_MAP[primary]
    if any(w in primary for w in RESTAURANT_WORDS):
        return 'Restaurant'
    for h in hierarchy or []:
        if h in SECTOR_MAP:
            return SECTOR_MAP[h]
        if any(w in h for w in RESTAURANT_WORDS):
            return 'Restaurant'
    return None


def main():
    kind, inp, out = sys.argv[1:4]
    clip = box(*map(float, sys.argv[4:8])) if len(sys.argv) >= 8 else None
    t = pq.read_table(inp).to_pylist()
    feats = []
    for r in t:
        g = wkb.loads(r['geometry'])
        if clip is not None and not g.intersects(clip):
            continue
        if kind == 'places':
            tax = r.get('taxonomy') or {}
            primary = tax.get('primary')
            sector = sector_for(primary, tax.get('hierarchy'))
            if not sector:
                continue
            a = (r.get('addresses') or [None])[0] or {}
            props = {
                'id': r['id'], 'name': (r.get('names') or {}).get('primary'), 'category': primary, 'sector': sector,
                'confidence': round(r.get('confidence') or 0, 2), 'address': a.get('freeform'), 'postcode': a.get('postcode'), 'locality': a.get('locality'),
                'website': (r.get('websites') or [None])[0], 'phone': (r.get('phones') or [None])[0],
                'brand': ((r.get('brand') or {}).get('names') or {}).get('primary'),
                'source': 'Overture Maps places (CDLA-Permissive-2.0)',
            }
            g = g.centroid if g.geom_type != 'Point' else g
        elif kind == 'segments':
            if r.get('subtype') != 'road':
                continue
            cls = r.get('class')
            if cls not in ROAD_CLASSES:
                continue
            names = r.get('names') or {}
            props = {'id': r['id'], 'name': names.get('primary'), 'class': cls, 'major': cls in ('motorway', 'trunk', 'primary', 'secondary'), 'source': 'Overture Maps transportation (ODbL, OpenStreetMap contributors)'}
            g = g.simplify(0.000005)
        elif kind == 'buildings':
            props = {'id': r['id'], 'name': (r.get('names') or {}).get('primary'), 'class': r.get('class'), 'subtype': r.get('subtype'), 'height': r.get('height'), 'levels': r.get('num_floors'), 'source': 'Overture Maps buildings (ODbL, OpenStreetMap contributors and others)'}
            g = g.simplify(0.0000025)
        else:
            raise SystemExit('unknown kind')
        gm = mapping(g)
        gm['coordinates'] = round_coords(gm['coordinates'])
        feats.append({'type': 'Feature', 'geometry': gm, 'properties': {k: v for k, v in props.items() if v not in (None, '')}})
    with open(out, 'w') as f:
        json.dump({'type': 'FeatureCollection', 'features': feats}, f, separators=(',', ':'))
    print(f'wrote {out}: {len(feats)} features')


def round_coords(c):
    if isinstance(c, (float, int)):
        return round(c, 6)
    return [round_coords(x) for x in c]


if __name__ == '__main__':
    main()
