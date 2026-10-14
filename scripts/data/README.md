# Open-data collection scripts

Everything under `public/data/warwick/` was produced by these scripts on 14 October 2026 from sources that need no account. Re-run them to refresh or to cover another area.

| Script | Source | Output | Licence |
|---|---|---|---|
| `overture_extract.py places/place …` then `overture_to_geojson.py places` | Overture Maps release 2026-09-23.1 (S3, public) | `places.geojson`: real businesses in Christie sectors, with category, address, postcode, website, phone, brand | CDLA-Permissive-2.0 |
| `overture_extract.py transportation/segment …` then `overture_to_geojson.py segments` | Overture Maps | `roads.geojson`: road centrelines with name and class | ODbL (OpenStreetMap contributors) |
| `overture_extract.py buildings/building …` then `overture_to_geojson.py buildings` | Overture Maps | `buildings.geojson`: footprints with height and levels where known | ODbL |
| `build_warwick.py` | DfT Road Traffic Statistics (`dft_traffic_counts_aadf.zip`, Google Cloud Storage) | `traffic.json`: every count point in the area with its AADF history | OGL v3 |
| `build_warwick.py` | HM Land Registry Price Paid Data (yearly CSVs on S3) | `price_paid.json`: all Warwick district transactions 2019 to 2025, geocoded approximately; `postcodes.json`: postcode centroids derived from place addresses | OGL v3; contains HM Land Registry data © Crown copyright and database right |

`overture_extract.py` reads only the parquet row groups whose bounding-box statistics intersect the requested area, using HTTP range requests, so a district costs tens of MB of transfer out of a 390 GB release and needs neither AWS credentials nor DuckDB extensions.

```bash
pip install pyarrow shapely fsspec aiohttp pandas
BBOX="-1.63 52.25 -1.49 52.36"          # Warwick district
python overture_extract.py places/place $BBOX raw/places.parquet
python overture_extract.py transportation/segment $BBOX raw/segments.parquet
python overture_extract.py buildings/building $BBOX raw/buildings.parquet
python overture_to_geojson.py places raw/places.parquet ../../public/data/warwick/places.geojson
python overture_to_geojson.py segments raw/segments.parquet ../../public/data/warwick/roads.geojson
python overture_to_geojson.py buildings raw/buildings.parquet ../../public/data/warwick/buildings.geojson -1.605 52.270 -1.505 52.305
python build_warwick.py raw/   # expects dft_traffic_counts_aadf.csv and pp-YYYY.csv in raw/
```

## What is still synthetic

Ownership polygons and proprietors, operators, Companies House, CQC, Ofsted, FSA, NHSBSA, VOA, EPC, planning, footfall and demographics. The hosts for those feeds (use-land-property-data.service.gov.uk, api.cqc.org.uk, download.companieshouse.gov.uk, voaratinglists.blob.core.windows.net, epc.opendatacommunities.org, planning.data.gov.uk, nomisweb.co.uk, api.os.uk and others) were not reachable from the collection environment. The ingestion plan for them is in `docs/DATA-COLLECTION-PLAN.md`; the parsers in `api/ingest/` are ready for the files once downloaded from a machine with access.
