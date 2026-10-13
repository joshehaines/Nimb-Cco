# Backend (phase 2) skeleton

FastAPI + PostGIS service implementing `docs/API.md`. The UI does not change when this replaces the mock: set `VITE_DATA_PROVIDER=http` and point `/api` at it (the Vite dev server and `nginx.conf` already proxy `/api`).

```
api/
  schema.sql          full PostGIS schema mirroring src/data/types.ts
  app/main.py         FastAPI app; search, map layers, titles, leases, businesses wired; others 501
  ingest/             one job per source: fetch() downloads, load() upserts, diff() raises alerts
  requirements.txt
```

## Run

```bash
docker compose up db                      # PostGIS on 5432 (from repo root compose file)
pip install -r api/requirements.txt
psql postgresql://cpi:cpi@localhost:5432/cpi -f api/schema.sql
uvicorn app.main:app --app-dir api --reload --port 8000
VITE_DATA_PROVIDER=http npm run dev       # UI against the API
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
