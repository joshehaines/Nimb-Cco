# Data collection plan (phase 2)

Prepared for the discussion on scraping and ingestion. Each source below has a stub in `api/ingest/` and a row in the Data sources screen. The order is the order in which the UI lights up with real data.

## Decisions needed from Christie & Co before work starts

| Decision | Why it matters | Default if no decision |
|---|---|---|
| Apply for HM Land Registry Business e-services and Business Gateway | Needed for £7 register, plan and lease documents inside the app. Lead time is weeks; needs a signed development licence and a client certificate. | Documents bought manually through the HMLR portal and uploaded. |
| Open an Ordnance Survey Data Hub account (Premium plan) | OS basemap, building heights, and OS Places for CRM address matching. First £1,000 per month of premium data is free; Places is billed from the first call at about £0.03 per 100 addresses. | Free OpenFreeMap basemap, Environment Agency LIDAR heights, postcode-centroid matching. |
| Buy the HMLR Registered Leases dataset (£5,000 + VAT per year)? | Gives every registered lease nationally (date, term, premium) without buying registers one by one. The free 3-month exploration licence lets us test first. | Leases discovered per title from the freehold register when needed. |
| Footfall vendor (Huq, BT, Geolytix) or none | The only data that cannot be sourced from government. Confirm which teams actually use Nimbus footfall. | Layer stays off; DfT traffic counts remain. |
| Priority regions and authorities for planning | National daily planning coverage is the largest engineering job. Starting with the offices' core areas gets value quickly. | PlanIt national feed plus planning.data.gov.uk; council adapters added by request. |
| CRM export format and cadence | Nightly CSV or API, the fields available, and whether a write-back (import) step is wanted. | Manual CSV upload through the CRM clean-up screen. |
| Hosting | On-premise VM, Azure, or AWS; SSO provider. | Docker Compose on a single VM behind the company SSO proxy. |

## Collected so far (14 October 2026)

Gathered without any account from hosts that were reachable from the build environment, and now shipped with the app under `public/data/warwick/` (scripts in `scripts/data/`):

| Dataset | Source and licence | What we hold | Used for |
|---|---|---|---|
| Road network | Overture Maps 2026-09-23.1 transportation (ODbL, OpenStreetMap contributors) | 11,876 road centrelines for Warwick district with names and classes | Demo title parcels are laid along the real streets; addresses carry real street names; schematic fallback basemap |
| Places | Overture Maps places (CDLA-Permissive-2.0) | 1,343 real businesses in Christie sectors (192 pubs, 87 hotels, 54 care, 54 childcare, 26 pharmacies, 14 dental, 49 medical, 151 convenience, 202 leisure, 508 restaurants, 6 garden centres) with address, postcode, website, phone, brand, source confidence | Real-business map layer, catchment supply counts, siting of demo businesses, postcode geocoder |
| Building footprints | Overture Maps buildings (ODbL) | 19,666 footprints for the Leamington and Warwick centres | Optional map layer |
| Traffic counts | DfT Road Traffic Statistics AADF (OGL v3) | 80 count points in the area with 2000 to 2025 history; 46,754 points nationally in the processed output | Traffic layer and mobility tab now show real counts |
| Price paid | HM Land Registry Price Paid Data (OGL v3) | 19,834 Warwick district transactions 2019 to 2025 (957 non-residential); 411,186 non-residential transactions nationally in the processed output | Price-paid map layer, sales near a site, sale detail panel |

Positions for price paid are approximate: postcode centroids derived from place addresses (1,770 postcodes) or, failing that, the postcode sector. AddressBase or ONS postcode centroids will replace this once licensed.

Still synthetic in the demo: ownership polygons and proprietors (INSPIRE and CCOD hosts unreachable), Companies House, CQC, Ofsted, FSA, NHSBSA, VOA, EPC, planning, footfall and demographics. Each of those hosts returned no route from the collection environment; they are open or account-based downloads that take minutes from an office machine and drop straight into `api/ingest/`.

## Sources in build order

| # | Source | Access | Auth | Volume | Refresh | Parse notes | Effort |
|---|---|---|---|---|---|---|---|
| 1 | HMLR INSPIRE Index Polygons | ZIP of GML per local authority from use-land-property-data.service.gov.uk | account + accept licence | 26 m polygons, about 15 GB raw | monthly | ogr2ogr to PostGIS; keep INSPIRE ID; OS attribution required | 2 d |
| 2 | HMLR CCOD and OCOD | Full CSV + change CSV, API key | account + licence | 3.9 m + 0.1 m rows | monthly | 4 proprietor slots per row; company number join to Companies House; **no marketing use** | 2 d |
| 3 | HMLR Price Paid | Monthly CSV | none | 29 m rows total, 100k per month | monthly | A/C/D record status; residential only | 1 d |
| 4 | Companies House | Bulk BasicCompanyData, streaming API, REST for officers, PSCs, charges | free API key | 5.4 m companies | streaming | Rate limit 600 per 5 min for REST; stream for status changes | 3 d |
| 5 | VOA rating list and summary valuations | Pipe-delimited text, weekly change files | accept restricted terms | 2.1 m hereditaments | weekly | Record types 01 (hereditament) and 02/03 (valuation lines with areas); SCAT code to sector map | 3 d |
| 6 | EPC (non-domestic, domestic, DEC) | Bulk zips + API | free API key | 1.3 m non-domestic | monthly + daily | UPRN present on most rows since 2020 | 1 d |
| 7 | FSA Food Hygiene Ratings | XML per authority or JSON API | none | 610k establishments | daily | Business type to sector; lat/lon supplied | 1 d |
| 8 | CQC locations and providers | Weekly spreadsheet + public API | API key (free) | 49k locations | weekly | Care home beds, service types, ratings, registration dates; provider brand | 2 d |
| 9 | Ofsted registered childcare | CSV on data.gov.uk | none | 62k providers | monthly | Places as recorded at registration; opt-outs missing | 1 d |
| 10 | NHSBSA pharmaceutical list and dispensing | CSV on opendata.nhsbsa.net | none | 11.6k pharmacies | quarterly + monthly | F-code key; monthly items per contractor for the volume trend | 1 d |
| 11 | DfT road traffic counts | AADF CSV | none | 46k count points | annual | Keep history per point; estimation_method flag | 1 d |
| 12 | Constraints (EA flood, Historic England, Natural England, MHCLG Green Belt, JNCC Ramsar) | WFS, shapefiles, GeoJSON | none | national layers | quarterly | Load as-is into `constraints` with kind | 2 d |
| 13 | planning.data.gov.uk | Entity API by dataset | none | 2.8 m entities | daily | Conservation areas, Article 4, listed building outlines, TPO zones, brownfield, local plan boundaries; applications where published | 2 d |
| 14 | PlanIt aggregator | JSON API | none, polite rate | 9 m applications | daily | Filter by authority and date; link to portal URL | 2 d |
| 15 | Council portal adapters | HTML scraping of Idox, Northgate, Agile | none | per authority | daily | Only for priority authorities with gaps; respect robots and rate limits | 1 d per adapter family |
| 16 | The Gazette insolvency notices | Notice feeds | none | 400k notices | daily | Match on company number | 1 d |
| 17 | Premises licence registers | Council CSVs | none | varies | varies | Schema mapping per council | 0.5 d per council |
| 18 | DNO substation and capacity data | Open data portals (UKPN, SSEN, NGED, NPG, ENWL, SPEN) | none or free key | national | monthly | Only if the energy/EV teams need it | 2 d |
| 19 | EA LIDAR building heights | 1 m DSM and DTM tiles | none | England | annual | DSM minus DTM masked to building footprints | 3 d |
| 20 | HMLR Business Gateway documents | SOAP/REST with client certificate | HMLR onboarding | on demand | on demand | OC1/OC2 ordering, PDF storage, extraction job with Claude | 4 d after onboarding |
| 21 | Footfall vendor | Vendor delivery (CSV, API) | contract | regional | monthly | H3 cells or MSOA to `footfall_cells` | 2 d |
| 22 | CRM export | CSV or API | internal | 100k records (est.) | nightly | Into `crm_records`; triggers linkage and matching | 2 d |
| 23 | Linkage job | internal | | | after each load | Builds `businesses` from registers, VOA, titles and companies; computes distress flags | 5 d |
| 24 | Alert generation | internal | | | after each load | Snapshot diffs per user watchlist and rules | 3 d |

Total for the core (rows 1 to 14, 16, 22 to 24): about 7 engineer-weeks, matching the phase 2 estimate in the research report.

## Storage and infrastructure

- PostgreSQL 16 with PostGIS on a VM with 8 to 16 GB RAM and 300 GB disk. England and Wales polygons, CCOD, VOA, EPC, Companies House and planning fit in under 200 GB with indexes.
- Object store (S3 or MinIO) for PDFs and raw downloads.
- Scheduler: cron or Prefect running `python -m ingest.run <job>`.
- Vector tiles for titles and footfall via pg_tileserv or Martin once the national polygons are loaded.

## Legal guardrails baked into the pipeline

- Every row carries `source`, `licence` and `fetched_at`; the UI and exports read them.
- CCOD and OCOD rows are tagged `HMLR-CCOD` and excluded from any marketing export.
- VOA rows are tagged `VOA-Restricted`; exports attach the terms.
- Private-individual proprietor names are only stored once an official copy has been bought, and are shown with a purpose and retention period.
- Portals with terms prohibiting automated access (Rightmove, Zoopla, OnTheMarket) are not scraped. Listings come from licensed feeds or our own instructions.
- Council and government sites are crawled with a contact address in the User-Agent, modest rate limits and caching.
