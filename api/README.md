# Backend (phase 2) skeleton

FastAPI + PostGIS service implementing `docs/API.md`. The UI does not change when this replaces the mock: set `VITE_DATA_PROVIDER=http` and point `/api` at it (the Vite dev server and `nginx.conf` already proxy `/api`).

```
api/
  schema.sql          full PostGIS schema mirroring src/data/types.ts
  app/main.py         FastAPI app; search, map layers, titles, leases, businesses wired; others 501
  ingest/             one job per source: fetch() downloads, load() upserts, diff() raises alerts
  requirements.txt
```

## What is implemented

- `app/main.py`: search, map layers, titles, leases, businesses, plus the collected open data: `/api/places`, `/api/places/{id}`, `/api/price-paid`, `/api/price-paid/{id}`, `/api/traffic`, `/api/map/open-data`, `/api/admin/sources`, `/api/health`.
- `ingest/parsers/`: pure parsers for CCOD/OCOD, INSPIRE GML (reprojected from EPSG:27700), CQC (API JSON and weekly CSV), Ofsted, FSA FHRS XML, NHSBSA list and dispensing, VOA list entries and summary valuations, EPC (domestic and non-domestic), Companies House BasicCompanyData, planning.data.gov.uk entities, HMLR price paid and DfT AADF. Each ingest module's `load()` upserts through them.
- `ingest/open_data.py`: loads `public/data/warwick` and the national tiles into `places`, `roads`, `buildings`, `traffic_counts`, `price_paid` and `postcode_centroids`.
- `tests/`: 32 tests. Parsers run against fixtures in `tests/fixtures` (fictional records in the published layouts); API handlers run against a scripted fake pool; loaders run against a recording connection. Integration against a live PostGIS needs Docker (`docker compose up db`), which was not available where this was written, so run `pytest` plus one manual load before relying on the SQL.

## Run

```bash
docker compose --profile load up loader   # schema + collected open data, then exits
docker compose up                         # web :8080, api :8000, db :5432
# or locally
pip install -r api/requirements.txt
psql postgresql://cpi:cpi@localhost:5432/cpi -f api/schema.sql
python -m ingest.open_data --public ../public/data [--ppd-dir raw/ppd --dft raw/dft_traffic_counts_aadf.csv]
uvicorn app.main:app --app-dir api --reload --port 8000
cd api && python -m pytest -q             # 32 tests, no database needed
VITE_DATA_PROVIDER=http npm run dev       # UI against the API (synthetic entities 501 until their feeds load)
```

## Ingestion jobs (`api/ingest`)

Each module exposes `fetch(workdir) -> Path`, `load(conn, path)` and, where relevant, `diff(conn)` for alert generation. Sources, formats, licences and cadences are documented in each module's docstring and summarised in the research report. Suggested scheduler: a single `python -m ingest.run <job>` entry point under cron or Prefect.

| Job | Source | Cadence | Licence |
|---|---|---|---|
| `hmlr_inspire` | INSPIRE index polygons (GML per LA) | monthly | OGL |
| `hmlr_ccod` | UK and overseas companies that own property (CSV full + change) | monthly | HMLR (no marketing) |
| `hmlr_ppd` | Price Paid (CSV) | monthly | OGL |
| `hmlr_leases` | Registered Leases (optional, £5k/yr) | monthly | HMLR |
| `hmlr_gateway` | Business Gateway OC1/OC2 on demand | on demand | HMLR docs |
| `voa` | Rating list + summary valuations (fixed-width text, weekly change files) | weekly | VOA restricted |
| `epc` | Non-domestic, domestic and DEC bulk + API | monthly + daily | OGL |
| `companies_house` | Bulk basic company data + streaming API + PSC + charges | daily/streaming | OGL |
| `gazette` | Insolvency notices | daily | OGL |
| `cqc` | Locations and providers (weekly spreadsheet + API) | weekly | OGL |
| `ofsted` | Registered childcare + inspections | monthly | OGL |
| `nhsbsa` | Consolidated pharmaceutical list + dispensing | quarterly + monthly | OGL |
| `fsa` | FHRS XML per authority / API | daily | OGL |
| `licensing` | Council premises licence CSVs | varies | OGL |
| `dft_aadf` | Road traffic counts (CSV) | annual | OGL |
| `webtris` | National Highways flows | daily | OGL |
| `planning_pdg` | planning.data.gov.uk entities + constraints | daily | OGL |
| `planning_planit` | PlanIt aggregator | daily | OGL |
| `planning_council` | Idox/Northgate/Agile adapters | daily | OGL |
| `constraints` | EA flood zones, Historic England, Natural England, MHCLG Green Belt | quarterly | OGL |
| `lidar_heights` | EA 1 m DSM-DTM to building heights | annual | OGL |
| `footfall_vendor` | Huq / BT / Geolytix feed | monthly | vendor |
| `crm_export` | Nightly CRM dump | nightly | internal |
| `linkage` | Builds `businesses` from registers + VOA + titles + companies (UPRN, postcode, name) | after each load | internal |
| `alerts` | Diffs snapshots and writes `alerts` per user watchlist | after each load | internal |
