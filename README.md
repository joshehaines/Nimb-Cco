# Christie Property Intelligence

Internal property intelligence platform for Christie & Co. A Nimbus Maps alternative built around **trading businesses and their operators**, not just land: ownership, titles, leases, planning, business rates, EPC, traffic, footfall, sector registers (CQC, Ofsted, NHSBSA, GPhC, FSA, premises licences), Companies House, distress signals, alerts, document intelligence and CRM clean-up.

This repository currently contains the **complete user interface running on a synthetic dataset** (Leamington Spa and Warwick). Every screen is wired to a `DataProvider` interface; the mock implementation is in `src/data/mock`, and the HTTP implementation for the forthcoming FastAPI + PostGIS backend is in `src/data/http` with its contract in `docs/API.md`. Switching from mock to live data is a one-line environment change.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests: matching, dataset coherence, provider
npm run build        # production bundle in dist/
npm run preview      # serve dist/ on http://localhost:4173
```

Optional `.env`:

```
VITE_OS_API_KEY=            # Ordnance Survey Data Hub key for the OS Light basemap; blank = free OpenFreeMap tiles
VITE_DATA_PROVIDER=mock     # mock | http
```

If basemap tiles are blocked by the network the map falls back to a blank canvas and still draws every data layer.

`VITE_DATA_PROVIDER=http npm run dev` exercises the REST contract: the Vite dev server includes `scripts/mockApiPlugin.ts`, which serves `docs/API.md` from the same in-memory dataset, so the HTTP code path is tested before the real backend exists. The backend skeleton (FastAPI, PostGIS schema, one ingestion job stub per source) lives in `api/`.

## What is in the UI

| Screen | Purpose | Nimbus equivalent |
|---|---|---|
| Dashboard | KPIs, latest alerts, distressed operators, lease expiries, sector mix, My Sites | none |
| Map | Ownership polygons by proprietor type, trading businesses by sector with distress halo, planning points by status, DfT traffic pins sized by AADF, footfall hex heatmap, constraints (flood, conservation, listed, Green Belt, Article 4, TPO), aerial toggle, hover popups, click-to-open | Map, layers |
| Info panel | Overview, Ownership (CCOD, charges, register and plan ordering at £7), Leases & docs (registered leases, lease purchase and LLM-extracted rent/breaks/reviews, document store), Operator (Companies House plus every sector register record), Planning (on title and within 250 m), Rates & EPC (VOA summary valuation floors, MEES), Mobility (footfall cells, DfT counts with sparklines), Constraints | Info panel |
| Sourcing | Strategy presets, 15 filters across sectors, tenure, owner type, RV, area, EPC, lease expiry, distress signals, regulator rating, constraints exclusion, planning activity; results table with CSV export and bulk watch | Site sourcing |
| My Sites | Watchlist with projects and notes, related alerts | My Sites |
| Pipeline | Kanban over My Sites: eight stages from Prospect to Completed, drag-and-drop, office/sector/project filters, fee forecast weighted by stage, printable stage reports | My Sites stages and stage reports (Enterprise) |
| Comparables | Sold trading-business evidence with £ per bed/place/room, RV and EBITDA multiples, radius search from a site, tenure/date/capacity/price filters, Christie & Co deals flagged as confidential, CSV export, map layer | Complete Comparables Tool |
| Catchment | Demographics and competitor supply within a radius, supply ratios against England benchmarks (care beds per 100 aged 85+, nursery places per 100 aged 0 to 4, pubs/pharmacies/dentists per 10k), two-site comparison, movement summary | none (Carterwood-style need assessment) |
| Campaigns | Direct-to-owner letter campaigns built from a sourcing result or site list, with a compliance gate: recipients from free CCOD data are blocked until a register is bought, a legitimate-interests assessment is recorded before approval, suppression list, templates per sector, mail-merge CSV and print-ready letters | Direct-to-vendor letters (Stannp) |
| Appraisal | Indicative value range for a site from nearby comps (per-unit and RV methods, IQR), adjustments for EPC/MEES, short lease, distress and regulator rating, catchment summary and comparable schedule; printable | none |
| Alerts | Ownership, planning, regulator, company, lease, EPC and VOA events with filters | Planning alerts, ownership alerts |
| Lease events | Expiry, break and rent-review calendar across the client base | none |
| CRM clean-up | CSV upload with auto column mapping, UPRN/title/company/register matching, issue detection (owner changed, company dissolved, deregistered, capacity and tenure mismatch, stale, invalid postcode), duplicate groups with survivor, review queue, cleaned export | none |
| Company | Status, officers, PSCs, charges, group structure, trading sites operated or owned, freehold titles held | Corporate ownership |
| Report | Printable site report (PDF via browser print) | Reports |
| Documents | Firm-wide document store with extraction summaries and spend | Nimbus Tokens |
| Data sources | Every feed, licence class, cadence, last run, status | none |

## Architecture

```
src/
  data/
    types.ts            domain model: Title, Proprietor, LeaseSummary, Company, Hereditament (VOA),
                        EPC, PlanningApplication, Constraint, TrafficCount, FootfallCell,
                        RegisterRecord (CQC/Ofsted/NHSBSA/GPhC/FSA/licence), Business, Alert,
                        WatchItem, SourcingFilters, DocumentOrder, CrmRecord, MatchCandidate...
    provider.ts         DataProvider interface (the only thing the UI talks to)
    mock/               deterministic synthetic world + MockProvider (matching, sourcing, orders)
    http/               HttpProvider over REST (docs/API.md)
  lib/
    matching.ts         postcode/address/company normalisation, Jaro-Winkler, token overlap
    geo.ts              small geodesy helpers (no heavy deps)
    sectors.ts          validated sector palette and icons
  store/ui.ts           zustand: layers, selection, filters, watchlist, map view (persisted)
  components/map/       MapLibre map, layer panel
  components/panels/    info panel (8 tabs), sourcing drawer
  pages/                one file per route
docs/
  API.md                REST contract the backend must implement
  research/             research report that led to this build
  screenshots/          captured by npm run e2e
  COMPETITOR-SCOPE.md   Nimbus/Searchland/LandInsight/Landstack feature matrix and why the five extra features were built
api/
  schema.sql            PostGIS schema mirroring the TypeScript types
  app/main.py           FastAPI service (search, map layers, titles, leases, businesses wired)
  ingest/               one job per data source with fetch/load/diff stubs and source notes
scripts/
  mockApiPlugin.ts      Vite middleware serving the API contract from MockProvider
  screenshot.mjs        headless Playwright walk-through of every page
```

Every record carries `source`, `fetchedAt` and `licence`. The UI shows provenance everywhere and the CSV exports carry licence notices (HMLR CCOD: no direct marketing; VOA: restricted terms).

## Deploy internally

```bash
docker build -t cpi-web .
docker run -p 8080:80 cpi-web
```

The image serves the static bundle with nginx and proxies `/api` to a backend named `api` (see `nginx.conf`). Put it behind the company SSO proxy.

## Hosting

Pushes to `main` build, test and publish the site to the `gh-pages` branch, which GitHub Pages serves at https://joshehaines.github.io/Nimb-Cco/ (repository setting: Pages source "Deploy from a branch", `gh-pages`, root; Pages needs a public repository on a free GitHub account). For internal production use, build the Docker image and run it behind company single sign-on.

## Real data already in the demo

`public/data/warwick/` holds genuine open data collected by `scripts/data/` (see its README): Overture Maps roads, places and buildings for Warwick district, DfT traffic counts with history, and HM Land Registry price paid 2019 to 2025. The synthetic demo is seated on it: title parcels follow the real streets, demo businesses sit beside real ones of the same sector, traffic points are real, and three map layers (real businesses, buildings, price paid) show the collected data as is. Ownership, operators and registers remain synthetic until the licensed feeds are connected.

### National coverage

`public/data/gb/` holds gzipped 0.5° tiles for the whole of Great Britain: 654,420 real places in Christie sectors, 149,153 non-residential HM Land Registry transactions since 2023 and all 46,754 DfT count points. The map loads the cells in view, so the real-business, price-paid and traffic layers, the catchment supply counts and the price-paid evidence on the Comparables page work anywhere in the country. Only the Warwick district has the synthetic demo overlay (titles, operators, registers).

### Backend

`api/` is a FastAPI service over PostGIS with the collected data loaded by `ingest.open_data` and parsers for every bulk source (`api/ingest/parsers`, tested against fixtures). `docker compose --profile load up loader` creates the schema and loads `public/data`; `docker compose up` then serves the UI, the API and the database. See `api/README.md`.

## Next: data collection (phase 2)

See `docs/DATA-COLLECTION-PLAN.md` for the source-by-source plan, effort and the decisions needed before ingestion starts.

The backend contract in `docs/API.md` maps one-to-one onto `MockProvider`. Ingestion order recommended by the research report:

1. HMLR INSPIRE polygons, CCOD/OCOD, Price Paid (bulk, monthly) into PostGIS.
2. VOA rating list and summary valuations; EPC bulk; Companies House bulk + streaming; FSA FHRS; CQC; Ofsted; NHSBSA.
3. DfT AADF; constraints from planning.data.gov.uk, Environment Agency, Historic England, Natural England, MHCLG.
4. Planning applications: planning.data.gov.uk, PlanIt, then council portal adapters for priority authorities.
5. HMLR Business Gateway (OC1/OC2) for documents, with an extraction job producing `ParsedLease` and register fields.
6. Footfall vendor feed (Huq, BT or Geolytix) if purchased; otherwise the layer stays off.

## Tests

`src/test/matching.test.ts` covers normalisation and similarity; `src/test/dataset.test.ts` checks the synthetic world is deterministic and internally consistent, that sourcing and search work, that the CRM matcher resolves over 80 percent of the dirty sample and finds duplicates, and that document orders complete and reveal private proprietors.

`scripts/screenshot.mjs` drives every page headlessly with Playwright and captures screenshots (used during development; needs `playwright-core` and the Chromium path inside the script).
