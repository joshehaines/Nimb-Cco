# Replicating Nimbus Maps internally: research and conclusion

Date: 13 October 2026
Prepared for: Christie & Co (see section 11 for the firm-specific analysis)
Scope: England and Wales (Nimbus' core coverage). Scotland and Northern Ireland sit on different land registers and are out of scope for the first build, although the sector registers in section 11 cover Wales and Scotland too.

---

## 1. Conclusion up front

**We can match Nimbus on roughly 80 to 85 percent of its data at source parity, because Nimbus is overwhelmingly an aggregator of UK public datasets.** The ownership polygons, corporate owners, title plans, registers, leases, traffic counts, planning constraints, EPCs, business rates, Companies House and environmental layers all come from the same government sources Nimbus uses. For those layers an internal build is not an approximation. It is the same data, often fresher, because we control the refresh schedule.

**Three things cannot be replicated for free or without a licence:**

| Gap | Why | Realistic option |
|---|---|---|
| Footfall and pedestrian heatmaps | Derived from mobile-phone location data owned by private vendors. Nimbus does not name its supplier. | Buy a vendor feed (Huq, BT, Geolytix, CACI). Budget roughly £5k to £15k a year for a regional feed, or £375 + VAT per site report on demand. |
| Live on-market listings | Nimbus licenses a Rightmove feed. Rightmove sells no public read API and scraping breaches its terms and UK database right. | Licence EG Propertylink or Realla, ingest our own instructions, and ingest agents' sites only with permission. |
| Third-party commercial sold comparables | EG Radius closed. Nimbus now relies on a "Contributed Data Model" from partner surveying firms, which is closed to outsiders. | Build from HM Land Registry corporate ownership price-paid fields, lease premiums, title registers, VOA rateable values, and our own deal history. |

**Recommendation:** build it, in three phases, and keep a single cheap Nimbus or Searchland seat for the first six months as a cross-check. The build pays back in year one against five or more Nimbus seats. For Christie & Co specifically, the bigger prize is the operator layer that Nimbus lacks: CQC, Ofsted, NHSBSA pharmacy, FSA hospitality, VOA and Companies House registers that can key and continuously refresh the CRM (section 11).

Rough annual cost comparison, for a 5 to 10 seat team:

| Item | Nimbus (Enterprise tier, needed for footfall, distressed, comps) | Internal build (steady state) |
|---|---|---|
| Seat licences | £18k to £47k (assumes £300 to £390 per seat per month, 12-month minimum; Enterprise is quote-only) | £0 |
| HM Land Registry documents | £7 each, pass-through | £7 each, pass-through |
| Ordnance Survey premium data | included | £0 to £2k (first £1,000 a month of premium data is free) |
| Footfall vendor | included in Enterprise | £5k to £15k, optional |
| Registered Leases bulk dataset | included | £5k + VAT, optional (per-title lookups are free in the register) |
| Hosting | n/a | £1.2k to £3.6k |
| **Total** | **£18k to £47k + docs** | **£6k to £26k + docs, after build** |

Build effort: 14 to 22 engineer-weeks to reach parity on the core layers (section 7). Nimbus' own pricing is quote-only today, so the Nimbus figures above are from third-party listings and should be confirmed with a quote.

---

## 2. What Nimbus Maps actually is

Nimbus Maps (Nimbus Property Systems Ltd, Warwick, company 08133761, founded 2012) is a browser map platform for developers, investors, agents and occupiers. It claims to link "over 1,000" (now "2,000") data sources to around 30 million properties. It is an Ordnance Survey Associate Partner. Trustpilot score sits around 4.0 to 4.5 from roughly 285 reviews; the recurring complaints are stale data (ownership and local-area data out of date, blamed on Land Registry lag) and billing practices (auto-renewal, hard cancellation). Those complaints are a design brief for what to do better.

### 2.1 Tiers and pricing

| Tier | Published or reported price | What it adds |
|---|---|---|
| Plus | £150 to £200 per month (12-month minimum) | Unlimited title lookups, unlimited OS MasterMap credits, 4 preset site-sourcing strategies, planning histories, planning alerts, My Sites workflow |
| Advanced | about £300 per month (third-party figure) | 12 sourcing strategies, strategic land, advanced planning alerts, residential listings, detailed site reports, land comparables |
| Enterprise | quote only | Distressed owner and tenant search, footfall and traffic heatmaps, competitor overlays, energy infrastructure, commercial comparables, stage reports |

Older public pricing listed Elite £150, Elite+ £270 and Elite MAX £390 per month. Land Registry documents are charged at cost (£7 each) through prepaid "Nimbus Tokens".

### 2.2 Feature inventory

Map and info panel
- Freehold and leasehold title boundaries over aerial imagery and OS MasterMap Topography
- Owner name and contact details, with Companies House links for corporate owners; private owners only after buying the register
- Title register, title plan and lease documents ordered in-panel at £7
- Use class, floor area, rateable value (VOA), EPC rating, building heights, price paid
- Planning history with daily updates and links back to the council portal
- Corporate ownership portfolio view (all titles held by a company)

Site sourcing and alerts
- Preset site-finding strategies (filters over ownership category, size, site coverage, constraints)
- Planning alerts by My Sites title, radius, local authority (up to 3), agent or applicant
- Distressed owners (administration, receivership, late accounts) and distressed tenants
- Ownership-change alerts
- Letter sending to owners

Constraints and environment
- Flood zones, Green Belt, AONB, SSSI, Ramsar, listed buildings, conservation areas, Article 4, agricultural land classification, public rights of way, tree preservation orders

Market data
- Commercial availability (live sales and lettings listings; Rightmove-enriched)
- Commercial comparables (20+ years, filter by use class, tenure, size, date; now an AI "Complete Comparables Tool" over 30 million records)
- Residential comparables, lettings comparables, current and predicted value
- Land comparables (Advanced and above)

Mobility
- Traffic pins from Department for Transport counts, colour-coded by age
- Traffic and pedestrian heatmaps from mobile-phone pings, now monthly with per-site pop-ups

Infrastructure and other
- Energy infrastructure (substations, grid capacity) for EV and energy developers
- Competitor overlays (points of interest)
- 3D views, reports (summary, detailed, stage), team sharing via My Sites

---

## 3. Layer-by-layer replication matrix

Grades: **Exact** = same source, same data. **Close** = same underlying facts from open sources with modelling or assembly work. **Partial** = meaningful subset only. **Licence** = achievable only by paying a third party.

### 3.1 Ownership, titles and leases

| Nimbus layer | Source we would use | Access and cost | Licence notes | Grade |
|---|---|---|---|---|
| Title boundaries (freehold) | HM Land Registry INSPIRE Index Polygons | Free bulk download, monthly, GML | Open Government Licence since July 2020; must show OS and HMLR attribution. Indicative extents only, not legal boundaries. Freehold only. | Exact |
| Title boundaries (leasehold), tenure label, title to UPRN link | HMLR National Polygon Service (National Polygon + Title Descriptor + Title Number/UPRN Look Up) | £20,000 + VAT a year | Commercial licence | Licence (skip at first; leasehold extents come from the freehold title's schedule of leases and £7 plans when needed) |
| Corporate owner name, company number, price paid, date added | HMLR "UK companies that own property" (CCOD) and "Overseas companies" (OCOD) | Free, monthly full file plus change file, CSV and JSON API | Must accept licence. **Prohibits direct marketing to proprietors and reselling as a standalone product.** Internal analysis is fine. Keep end-user records (auditable for 12 months). | Exact |
| Private individual owner | Official copy of register | £7 per title via HMLR Business Gateway or portal | Register contents are personal data under UK GDPR when the owner is an individual. See section 5. | Exact |
| Title register, title plan, lease document | HMLR Business Gateway (OC1 register and plan, OC2 lease and referred documents) | £7 each since 9 December 2024 (£11 by post). Requires Business e-services account, development licence, and an HMLR-issued client certificate. Test environment available. | Same price Nimbus charges, so no saving, but no token mark-up and documents are stored once for the whole company. | Exact |
| Registered leases layer (date, term, premium, alienation flag, UPRN) | HMLR Registered Leases dataset | £5,000 + VAT a year commercial; free 3-month exploration licence | No commercial/residential flag; infer from VOA or EPC match. Rents are not included anywhere in bulk data. | Exact (bulk) or Close (per title from the freehold register's schedule of leases) |
| Lease rent, break dates, repair terms | The lease itself (OC2, £7) | PDF, often scanned | Extract with an LLM pipeline into structured fields (section 6). Nimbus does not do this. | Better than Nimbus |
| Restrictive covenants | HMLR Restrictive Covenants dataset | On the same portal, licence terms apply | | Exact |

### 3.2 Property attributes

| Nimbus layer | Source | Access and cost | Licence notes | Grade |
|---|---|---|---|---|
| Rateable value, property description (use), floor areas by floor, SCAT code | VOA Rating List and Summary Valuation downloads (2026 list, 2023, 2017, 2010 epochs, weekly change files) | Free | Restricted VOA terms, not OGL. Pass-on allowed only with the terms attached. Internal use fine. Floor area absent where valuation is not area-based. VOA is now part of HMRC. | Exact |
| EPC rating, floor area, main heating, inspection date (non-domestic, domestic, DEC) | MHCLG Energy Performance of Buildings open data | Free bulk CSV and API with key | Open; includes expired certificates | Exact |
| Building heights, number of floors | Environment Agency 1 m LIDAR composite (DTM and DSM, about 99 percent of England, free) masked to building footprints; or OS NGD Buildings height attributes (premium, inside OS free credit for low volumes) | Free or near free | OS NGD "numberoffloors" is mostly modelled | Close (LIDAR) or Exact (OS) |
| Addresses, UPRN | OS Open UPRN (free, coordinates only), OS Places API (£0.0282 per request of up to 100 addresses, no free allowance), ONS Postcode Directory (free) | Pennies | Places is the best address matcher for CRM cleaning | Exact |
| Base map | OS NGD Tiles and Features via OS Data Hub (first £1,000 premium data free each month, excluding Places), OS OpenMap Local and Zoomstack free, OpenStreetMap | Free at our volume | | Exact |
| Aerial imagery | Google Maps Platform or Bing imagery tiles under their terms; OS APGB imagery is premium | Low | Nimbus uses aerial imagery under its own licence | Close |

### 3.3 Planning

| Nimbus layer | Source | Access and cost | Notes | Grade |
|---|---|---|---|---|
| Planning applications, decisions, documents, daily updates | Three tiers: planning.data.gov.uk API (free, consistent, but application coverage still patchy); PlanIt aggregator (free, no key, covers around 400 councils, check its terms and rate limits); direct council portal scrapers (Idox, Northgate, Agile and others) for priority authorities | Free; engineering time is the cost | This is the single largest engineering effort. Buying Searchland's planning API on credits (1 credit per 20 applications) is a sensible stop-gap. | Close |
| Planning alerts by title, radius, authority, agent, applicant | Built on the above | | Software feature, not data | Exact |
| Listed buildings, conservation areas, Article 4, TPOs, Green Belt, AONB, SSSI, Ramsar, ALC, flood zones, brownfield registers, local plan boundaries | planning.data.gov.uk constraint datasets; Historic England NHLE; Natural England open data; MHCLG Green Belt; Environment Agency Flood Zones 2 and 3 and surface water; JNCC Ramsar; council brownfield registers | Free, mostly OGL | Flood zones are area-level, not property-level, same caveat Nimbus carries | Exact |
| Strategic land (SHLAA, allocations) | Council publications; partial national coverage on planning.data.gov.uk | Free but inconsistent | Nimbus is also patchy here | Partial |
| Public rights of way | Per-council definitive maps, partly aggregated by volunteers | Free, inconsistent | | Partial |

### 3.4 Companies and distress

| Nimbus layer | Source | Access and cost | Notes | Grade |
|---|---|---|---|---|
| Company profile, officers, PSCs, charges (lenders), accounts, status | Companies House API (free, 600 requests per 5 minutes per app) plus free bulk products and streaming API | Free | Join to CCOD on company number | Exact |
| Distressed owners and tenants (administration, receivership, late filings) | Companies House status and filing dates; The Gazette insolvency notices (web notices are free; bulk data service is paid, contact data@thegazette.co.uk) | Free to low | Nimbus' filter is exactly this logic | Exact |
| Corporate portfolio view | CCOD grouped by company number, plus group structure from PSC data | Free | We can go further than Nimbus by rolling up group companies | Better |

### 3.5 Market data

| Nimbus layer | Source | Access and cost | Notes | Grade |
|---|---|---|---|---|
| Residential sold prices | HMLR Price Paid Data (1995 to date, monthly) | Free, OGL | Residential only today | Exact |
| Commercial sold prices | CCOD and OCOD "Price Paid" field (corporate purchases), Registered Leases premiums, title registers (£7), Nimbus-style contributed comps are closed | Free to £7 | Thin compared with CoStar or EG Radius. Our own transaction history is the differentiator. | Partial |
| Commercial availability | Licensed feed from EG Propertylink or Realla (quote), our own instructions, agents' sites with permission | Quote | Rightmove's commercial feed is agent push-only; Data Services is enterprise analytics, not raw listings | Licence |
| Residential availability and lettings | Same constraints | Quote | Low priority for a commercial team | Licence |
| Residential valuation estimate | Model over PPD, EPC and attributes | Build | Nimbus' AVM is also modelled | Close |

### 3.6 Mobility

| Nimbus layer | Source | Access and cost | Notes | Grade |
|---|---|---|---|---|
| Traffic count pins (AADF by vehicle type, count method, year) | DfT Road Traffic Statistics bulk CSV (OGL, major roads every link, minor roads sampled on rotation; 2024 figures published mid-2025) | Free | Nimbus' Traffic Pins layer is this dataset; it was still citing 2022 data in 2024 | Exact, fresher |
| Strategic road network flows (15-minute) | National Highways WebTRIS API | Free, no key | Service had a planned outage in 2025; verify availability | Better than Nimbus |
| Pedestrian footfall heatmap | Huq (reports £375 + VAT per site, feeds from about $900 per month, roughly £1,000 per place per year), BT Footfall API (hourly and daily at MSOA and local authority level, production access approved case by case), Geolytix, CACI, Citi Logik via DfT (commercial licence) | Paid | Free proxies exist: council sensor feeds (Leeds, York weekly OGL), GLA High Streets Explorer, OpenStreetMap POI density. None give a national heatmap. | Licence |
| Vehicle heatmap from mobile data | Same vendors | Paid | DfT counts cover the roads that matter for retail and industrial sites | Licence |

### 3.7 Infrastructure and context

| Nimbus layer | Source | Access and cost | Grade |
|---|---|---|---|
| Substations, capacity, embedded capacity registers | DNO open data portals (UKPN, SSEN CC-BY 4.0, NGED, Northern Powergrid, ENWL, SPEN), National Grid ESO | Free | Close |
| Competitor overlays (POI) | OpenStreetMap, Overture Places (CDLA permissive), FSA Food Hygiene Ratings API (free, every food business with address), Geolytix Retail Points (open), Companies House by SIC and postcode | Free | Close |
| Demographics | ONS Census 2021, NSPL, Index of Multiple Deprivation | Free | Exact |

---

## 4. Where an internal build beats Nimbus

1. **Freshness.** CCOD monthly, Companies House streaming, planning daily, DfT annual on release day. Nimbus reviews repeatedly cite stale data.
2. **Documents become data.** Every £7 lease or register we buy is parsed once into structured fields (parties, rent, term, break, review dates, user clause, alienation) and never bought twice. Nimbus only stores the PDF.
3. **No seat limits.** Everyone in the company, including finance and admin, can use it.
4. **Our data on the map.** Instructions, deals, contacts, fees, viewings, and historic comps plotted against public data. Nimbus cannot see any of that.
5. **Exports and APIs** with no restrictions beyond the source licences.
6. **Group-level ownership.** Roll up CCOD titles through PSC and group structures to see a landlord's whole estate across subsidiaries.

---

## 5. Legal and licensing summary

- **Open Government Licence** datasets (INSPIRE polygons, Price Paid, DfT, EPC, planning constraints, Companies House, FSA, flood zones) allow commercial internal use with attribution.
- **HMLR CCOD and OCOD** are free but their licence bars using the data to market goods or services to the registered proprietors, and bars redistribution as a standalone product. Use them for research, matching and portfolio analysis. If the business wants to run owner letter campaigns (which Nimbus offers), the lawful route is the £7 register per title plus a documented legitimate-interests assessment, not the bulk file. Take legal advice before any campaign.
- **VOA rating list** data is under restricted terms, not OGL. Internal use is permitted; anything passed on must carry the same terms.
- **HMLR Business Gateway** requires a signed development licence, a Business e-services account and a client certificate. Documents are charged per request. HMLR standard terms prohibit direct marketing to registered proprietors from supplied data.
- **UK GDPR.** Register copies name individual owners. Store them with a purpose, a retention period and a lawful basis. Postal B2B contact can rest on legitimate interests; email and SMS need consent. Stop immediately on objection.
- **Scraping.** Government portals under OGL are fine to crawl politely. Rightmove, Zoopla and OnTheMarket prohibit automated extraction in their terms and are protected by UK database right; litigation risk is real and the data cannot be shown to the business as if licensed. Do not scrape the portals. Council planning portals are public bodies publishing under OGL or similar, and PlanIt already aggregates them; crawl with rate limits and a contact address in the user agent.
- **OS Data Hub** terms require attribution and bar redistribution of premium data outside the organisation. INSPIRE polygons also carry an OS attribution requirement.
- **Footfall vendors** license by seat or by area; read the terms for internal-only use before purchase.

---

## 6. Proposed architecture

Keep it boring and self-hostable.

```
Ingest (scheduled jobs, Python)          Store                     Serve
-----------------------------------      ---------------------     -------------------------------
HMLR: INSPIRE, CCOD/OCOD, PPD,           PostgreSQL + PostGIS      API (FastAPI or Node)
  Registered Leases (optional),          one row per title,        Vector tiles (pg_tileserv
  Business Gateway OC1/OC2 on demand     per UPRN, per company,     or Martin) from PostGIS
VOA list + summary valuations            per hereditament,          MapLibre GL front end
EPC bulk + API                           per application            OS NGD basemap tiles
DfT AADF, WebTRIS                        Document store (S3/MinIO)  Auth via company SSO
Companies House bulk + streaming,          for PDFs                 Alerts via email/Teams/Slack
  Gazette notices                        Search (Postgres FTS       Exports CSV/GeoJSON/XLSX
planning.data.gov.uk, PlanIt,              or Meilisearch)
  council scrapers
Constraints (EA, NE, HE, MHCLG, JNCC)
DNO portals, OSM/Overture, FSA
Footfall vendor feed (optional)
CRM export (nightly)
LLM extraction (Claude): leases, registers, planning decision notices -> structured JSON
```

Join keys, in order of reliability: title number, UPRN, company number, then normalised address. Every record keeps its source, licence tag and fetched-at timestamp so licence restrictions (for example CCOD no-marketing) can be enforced in the UI.

Hosting: one 8 to 16 GB VM or a small managed Postgres plus a container host. England and Wales ownership, VOA, EPC and planning fit comfortably in under 200 GB.

---

## 7. Build plan and effort

| Phase | Weeks | Delivers |
|---|---|---|
| 1. Ownership core | 4 to 6 | PostGIS schema, INSPIRE polygons, CCOD/OCOD, Companies House join, VOA, EPC, OS basemap, map UI with info panel, title search, corporate portfolio view, CSV export. Business Gateway application started (lead time is HMLR's, not ours). |
| 2. Documents, planning, constraints, traffic | 5 to 8 | OC1/OC2 ordering and storage, LLM extraction of registers and leases, lease-event calendar, planning ingestion (planning.data.gov.uk plus PlanIt plus top 20 council scrapers), constraints layers, DfT and WebTRIS, distressed filters, alerts engine. |
| 3. Internal features | 5 to 8 | CRM cleaning pipeline (section 8), deals and instructions layer, internal comps database, reports, footfall vendor integration if purchased, POI overlays, DNO layers. |

Total 14 to 22 engineer-weeks for one strong full-stack engineer with geospatial experience, less with AI-assisted development. Parity on the data layers is reached at the end of phase 2.

---

## 8. Additional internal benefits beyond Nimbus

### 8.1 CRM data cleaning and enrichment (the highest-value add)

Typical agency CRM problems: duplicated landlords and occupiers, free-text addresses, dead companies, contacts attached to the wrong entity, and no link between a contact and the properties they actually own or occupy.

Pipeline:
1. Export CRM accounts, contacts and properties nightly.
2. Address normalisation and UPRN assignment via OS Places API (about £0.03 per 100-address call) with the free ONS Postcode Directory as fallback.
3. Company normalisation via Companies House search: attach company number, status, registered office, SIC codes, officers and PSCs; flag dissolved, in administration or late-filing companies.
4. Ownership truthing: for every CRM property, look up the current CCOD proprietor and date added. Flag where the CRM landlord no longer owns the asset, and surface the new owner as a lead.
5. Occupier truthing: match VOA hereditaments and Registered Leases to CRM occupiers; flag units with a different ratepayer.
6. Deduplication with Splink and the Ministry of Justice UK Address Matcher (both open source) across names, addresses, company numbers and phone or email.
7. Write back suggested merges and corrections as a review queue, never silently.

Outcomes: a CRM keyed on title number, UPRN and company number; automatic "owner changed", "company dissolved", "lease expiring" triggers; and a defensible contact base for marketing with the lawful basis recorded per contact.

### 8.2 Lease and asset management intelligence
- Lease event calendar built from parsed leases: expiries, breaks, rent reviews, with 12-, 6- and 3-month alerts.
- Rent roll reconciliation against registered leases for client portfolios.
- MEES compliance tracker from EPC data (non-domestic properties below E cannot be let; B by 2030 is the proposed trajectory) as a service to clients.
- Business rates review candidates by comparing VOA rateable value per square metre with neighbours in the same SCAT code.

### 8.3 Origination
- Ownership-change alerts on any watched title, company or area.
- Distressed owner and tenant signals combined with charge data to see which lender is exposed.
- Planning alerts tied to our instructions and target areas, with decision notices summarised by the LLM.
- Vacancy signals: EPC lodged plus new VOA assessment plus no occupier company at the address.
- Portfolio mapping of a prospective client's whole estate from CCOD and PSC roll-ups before a pitch.

### 8.4 Reporting
- One-click site report, comparable schedule and ownership schedule with the company brand, exported to PDF, Word or Excel.
- Shared projects with comments and a deal pipeline, replacing Nimbus' My Sites.

---

## 9. Risks and honest caveats

- **Planning ingestion is the long pole.** National coverage with daily updates is why Nimbus and Searchland charge what they do. Start with PlanIt plus the authorities that matter, and buy a planning API on credits for the rest if needed.
- **HMLR Business Gateway onboarding** takes weeks and needs a certificate and a signed licence. Apply in week one. Until then documents can be bought through the HMLR portal manually.
- **Footfall will never be free.** Decide early whether the team actually uses Nimbus' heatmaps; if yes, budget a vendor feed. If it is occasional, buy per-site reports.
- **Live listings** need a licence or will be limited to our own stock. Do not scrape the portals.
- **Leasehold polygons** are not in the free INSPIRE set. The £20k National Polygon Service is the only bulk route; per-title plans at £7 cover most needs.
- **Scotland** requires Registers of Scotland data at a cost and a separate integration.
- **Maintenance.** Budget around one day a week of engineering after launch for source changes, scraper breakage and schema updates. Nimbus' price includes that labour.
- **Licence hygiene.** CCOD no-marketing and VOA restricted terms must be enforced in the product, not just remembered.

---

## 10. Verdict

Nimbus is a well-assembled front end over public data, with three paid add-ons (footfall, Rightmove listings, contributed comps). An internal platform reproduces the public data exactly, improves on it in freshness and document intelligence, and adds CRM cleaning, lease events and origination alerts that Nimbus cannot offer because it cannot see our data. The build is a 14 to 22 week project plus ongoing maintenance, with steady-state data costs of roughly £6k to £26k a year depending on whether footfall and the bulk leases dataset are purchased. Against £18k to £47k a year for Nimbus Enterprise seats, the case is sound for any team of five or more, and strong once the CRM and lease-event value is counted.

Suggested next step: approve phase 1, apply for HMLR Business e-services and Business Gateway access, open an OS Data Hub premium account, and request footfall quotes from Huq and BT so the optional spend is known before phase 3.

---

## 11. Christie & Co context: why this matters more for a business-property adviser

Christie & Co (part of Christie Group plc, founded 1935, 33 offices across the UK and Europe) is the UK's leading specialist adviser for buying, selling, valuing and financing trading businesses in hotels, pubs, restaurants, childcare and education, care, dental, medical, pharmacy, convenience retail, leisure and garden centres. In 2025 the group sold 1,164 businesses worth close to £2.0bn, with group revenue of £70.6m, and sister brands Pinders (valuation), Christie Finance (debt brokerage) and Venners (stocktaking) sit alongside. Its own 2026 outlook expects continued financial distress and more non-performing operational real estate in these sectors.

That changes what a Nimbus replica should be. For a land developer, the unit of interest is the title. For Christie & Co, the unit of interest is the **trading business**: an operator running a regulated or licensed activity from a property that may be freehold, leasehold or tied. Nimbus answers "who owns the freehold and what can be built". Christie & Co needs that plus "who operates it, under what registration, with what capacity, how is it rated, who is the landlord, when does the lease end, and is the operator or landlord in distress". Nimbus holds almost none of the operator layer. Public sector registers hold all of it.

### 11.1 How Nimbus is used today at a firm like Christie & Co, and what the replica must keep

| Daily job | Nimbus feature used | Replica source |
|---|---|---|
| Identify freeholder of a pub, hotel, care home or nursery before a pitch or valuation | Ownership polygons, CCOD, £7 register | Same (section 3.1) |
| Check tenure and lease term for a leasehold business sale | Register, schedule of leases, lease document | Same, plus LLM lease extraction |
| Map a pubco, care group or nursery group's estate | Corporate portfolio view | CCOD by company number plus group roll-up through PSC data |
| Planning history and constraints for change of use, extensions, bed additions | Planning layers | planning.data.gov.uk, PlanIt, council scrapers |
| Rateable value and floor area for a pub, hotel or shop (a core valuation input) | VOA layer | VOA list and summary valuations (free) |
| Footfall and traffic for roadside, forecourt, restaurant and convenience sites | Mobility heatmaps | DfT counts free; footfall vendor paid |
| Spot distressed owners and tenants | Distressed filters | Companies House, Gazette, plus sector regulator signals below |
| Sold comparables for the valuation team and Pinders | Commercial comparables | Christie's own transaction history is already the best dataset in these sectors; add CCOD price paid and lease premiums |

### 11.2 The operator layer: sector registers Nimbus does not have

Every Christie & Co sector has a national register with operator name, address, capacity and status. These are the natural match keys for the CRM and the richest source of leads.

| Sector | Register | Key fields | Access and licence |
|---|---|---|---|
| Care homes, nursing homes, domiciliary care, dental practices, GP practices, clinics (England) | Care Quality Commission locations and providers | CQC location ID, provider ID, provider name, brand, registered manager, service types, care home bed numbers, registration date, deregistration date, rating and inspection date, ownership type | Free weekly bulk spreadsheet and a public API, Open Government Licence |
| Care (Wales, Scotland) | Care Inspectorate Wales; Care Inspectorate Scotland datastore | Service type, capacity, provider, grades | Free |
| Childcare and early years | Ofsted Registered Childcare dataset and Childcare providers and inspections statistics | URN, provider name, setting type, registered places, inspection outcome | Free, OGL; places figure is as recorded at registration or last inspection, and some providers opt out of the published list |
| Independent schools | DfE Get Information About Schools | URN, proprietor, capacity, phase | Free, OGL |
| Pharmacies (England) | NHSBSA Consolidated Pharmaceutical List and monthly dispensing data | ODS F-code, trading name, contractor, address, items dispensed per month | Free, OGL; dispensing volume is a direct trading indicator |
| Pharmacies (regulatory) | GPhC premises register | GPhC premises number, superintendent, owner | Quarterly public list; full extract by paid subscription |
| Dental practices | CQC (England); NHS Scotland open data (list sizes); NHS dental statistics England | Practice, provider, NHS activity | Free |
| Pubs, bars, restaurants, hotels, cafes, takeaways | FSA Food Hygiene Rating Scheme | Business name, address, business type (Pub/bar, Restaurant, Hotel/B&B, Takeaway), rating, local authority, latitude and longitude | Free API, no key, OGL; covers every food business in the UK, so it is the closest thing to a national hospitality premises register |
| Licensed premises | Council premises licence registers | Premises licence number, holder, DPS, licensable activities | Free but council by council on data.gov.uk, patchy; some full versions withheld for OS licensing |
| Hotels, pubs, care homes, nurseries, shops, forecourts, garden centres (any trading property) | VOA rating list property description and SCAT code | Hereditament, description (Public House and Premises, Hotel and Premises, Care Home, Day Nursery, Petrol Filling Station, Garden Centre), rateable value, floor areas, and for pubs and hotels the valuation scheme itself | Free, restricted terms; this is the best single national list of trading premises by type |
| Any operator company | Companies House | SIC codes (55100 hotels, 56302 public houses and bars, 56101 licensed restaurants, 87100 and 87300 care, 88910 childcare, 47730 pharmacies, 86230 dental), officers, PSCs, charges, accounts, status | Free API and bulk, OGL |
| Insolvency and distress | The Gazette notices; Companies House status and late filings; CQC enforcement and "inadequate" ratings; Ofsted "inadequate" and suspensions; FSA 0 to 1 ratings; VOA deletions | | Free (Gazette bulk is paid) |

Joining these to the Nimbus-style property layer is straightforward: FSA, CQC and Ofsted carry postcodes and often coordinates, VOA carries full addresses, and OS Places turns any of them into a UPRN, which then links to the INSPIRE polygon and title number via the freehold register or the optional UPRN look-up dataset.

### 11.3 What this means for the CRM clean-up

Christie & Co's CRM, like most multi-sector brokerages, holds decades of business records, operators, landlords, buyers, lenders and advisers across many offices. The usual defects are:

- The same pub, hotel or care home entered several times under different trading names, addresses or spellings.
- Operators recorded as the owner when they are tenants, and freeholders missing entirely.
- Businesses that have closed, deregistered or changed hands with no update.
- Buyer and applicant records with stale company names, dissolved entities or no company number.
- Capacity, bedrooms, beds, places and rateable values keyed by hand years ago.
- No link between a contact and the properties they currently own or operate.

The replica fixes this by giving every CRM business record a set of authoritative external identifiers and refreshing them automatically:

| CRM entity | Identifier assigned | Source of truth | What it enables |
|---|---|---|---|
| Business or property record | UPRN, title number, VOA hereditament | OS Places, HMLR, VOA | Exact dedupe, freehold versus leasehold flag, rateable value and floor area refreshed |
| Care, dental, medical business | CQC location ID and provider ID | CQC weekly | Beds, rating, registration status, registered manager, brand; closure and deregistration alerts |
| Childcare business | Ofsted URN | Ofsted | Places, rating, suspension alerts |
| Pharmacy | ODS F-code and GPhC number | NHSBSA, GPhC | Dispensing volume trend as a trading proxy; contract changes |
| Hospitality business | FSA FHRS ID, premises licence number | FSA, councils | Business type, new openings, closures, rating drops |
| Operator, buyer, landlord company | Company number | Companies House | Status, officers, PSCs, charges, group structure, insolvency |
| Freeholder | CCOD proprietor and date added | HMLR monthly | Ownership-change alerts; new landlord leads; expired landlord records closed |
| Lease | Registered lease entry and parsed lease fields | HMLR, LLM extraction | Expiry, break and review calendar for lease-renewal and re-gear instructions |

Practical sequence:
1. Export CRM businesses, contacts and companies. Normalise addresses with OS Places and assign UPRNs.
2. Match each business to VOA (by UPRN and description), then to the sector register for its category (CQC, Ofsted, NHSBSA, FSA). Record confidence scores with Splink; put anything below a threshold into a review queue per office.
3. Match companies to Companies House by number where present, otherwise by name and registered postcode. Flag dissolved and insolvent entities.
4. Look up the freeholder for every matched UPRN through INSPIRE and CCOD; create missing landlord records, mark tenants correctly, close out records whose owner changed.
5. Merge duplicates in the review queue; keep the survivor keyed on UPRN plus register ID so it cannot duplicate again.
6. Schedule weekly refreshes from the registers so capacity, ratings, status and ownership never go stale again, and route changes to the relevant sector team as alerts.

### 11.4 Christie-specific features the replica can add

- **Sector heat maps**: every CQC-registered care home, Ofsted nursery, NHS pharmacy and FSA-registered pub or hotel on the map, filterable by capacity, rating, operator group, tenure and freeholder, with Christie's instructions and completions overlaid.
- **Operator estate view**: all sites run by a care group, pubco, nursery group or pharmacy multiple, built from register provider IDs rather than company names, with the freeholder of each site alongside.
- **Early distress signals by sector**: CQC "inadequate" or enforcement action, Ofsted suspension, falling dispensing volumes, FSA rating collapse, late accounts, new charges, Gazette notices, and VOA deletions, combined into one watch list for the restructuring and insolvency teams.
- **Lease event pipeline**: parsed leases produce a calendar of expiries, breaks and reviews across the client base for the lease advisory and valuation teams.
- **New business detection**: new CQC registrations, new Ofsted URNs, new FSA registrations and new pharmacy contracts in the CRM's target areas, with the freeholder already attached, feed the business development teams.
- **Valuation support**: VOA rateable value, floor areas, capacity from registers, EPC, planning history and Christie's own comparables assembled into a one-click appraisal pack for Christie & Co and Pinders.
- **Christie Finance cross-sell**: charges data shows which lender holds security on each site and when a facility was registered, which flags refinancing opportunities.

### 11.5 Revised verdict for Christie & Co

The map-and-ownership half of Nimbus is replicable from the same public sources. The half that matters most to Christie & Co, the operator and trading layer, is not in Nimbus at all and is almost entirely free from CQC, Ofsted, NHSBSA, FSA, VOA and Companies House. Building the platform around trading businesses rather than titles, with the CRM keyed on UPRN, title number, company number and sector register ID, delivers the Nimbus workflows the teams already rely on, removes the per-seat cost, and turns the CRM into a continuously refreshed market database for every office and sector. The footfall and live-listings gaps remain and should be bought where a sector team genuinely uses them.

---

## Appendix A. Primary sources used

Nimbus Maps
- Packages and tiers: https://www.nimbusmaps.co.uk/packages
- Features index: https://www.nimbusmaps.co.uk/features
- Mobility, footfall and traffic: https://www.nimbusmaps.co.uk/features/mobility-footfall-traffic
- Info panel and Land Registry documents: https://www.nimbusmaps.co.uk/features/info-panel and https://www.nimbusmaps.co.uk/land-registry-data-online
- Commercial comparables and Contributed Data Model: https://www.nimbusmaps.co.uk/features/commercial-comparables and https://www.nimbusmaps.co.uk/contributed-data-model
- Commercial availability and Rightmove data: https://www.nimbusmaps.co.uk/commercial-availability and https://www.nimbusmaps.co.uk/features/rightmove-market-data
- Planning applications and alerts: https://www.nimbusmaps.co.uk/features/planning-applications and https://www.nimbusmaps.co.uk/features/planning-search-alerts
- Distressed filters: https://www.nimbusmaps.co.uk/features/distressed
- Monthly footfall update: https://www.nimbusmaps.co.uk/blog/updated-monthly-footfall-data
- Nimbus Tokens: https://www.nimbusmaps.co.uk/blog/introducing-nimbus-tokens
- Platform enhancements and Complete Comparables Tool: https://www.nimbusmaps.co.uk/blog/nimbus-unveils-major-platform-enhancements-setting-a-new-standard-for-property-intelligence
- OS partner listing: https://www.ordnancesurvey.co.uk/customers/businesses/find-a-business-partner/nimbus-maps
- Third-party pricing listings: https://www.theproptechscout.com/listing/nimbus-maps/ , https://www.boom.online/compare , https://sitelens.co.uk/compare/nimbus-maps/
- Reviews: https://uk.trustpilot.com/review/www.nimbusmaps.co.uk
- Company record: https://find-and-update.company-information.service.gov.uk/company/08133761

HM Land Registry
- Use land and property data portal: https://use-land-property-data.service.gov.uk/
- INSPIRE polygons: https://use-land-property-data.service.gov.uk/datasets/inspire
- UK companies that own property (CCOD) and licence: https://use-land-property-data.service.gov.uk/datasets/ccod and https://use-land-property-data.service.gov.uk/datasets/ccod/licence/view
- Overseas companies (OCOD): https://use-land-property-data.service.gov.uk/datasets/ocod
- Registered Leases, spec and commercial licence: https://use-land-property-data.service.gov.uk/datasets/leases , https://use-land-property-data.service.gov.uk/datasets/leases/tech-spec , https://use-land-property-data.service.gov.uk/datasets/leases/licence/commercial/view
- National Polygon Service: https://www.gov.uk/guidance/national-polygon-service
- Price Paid Data scope: https://www.gov.uk/about-the-price-paid-data
- Information services fees (December 2024 change): https://www.gov.uk/guidance/changes-to-fees-for-hm-land-registrys-information-services and https://www.gov.uk/guidance/hm-land-registry-information-services-fees
- Business Gateway developer pack: https://landregistry.github.io/bgtechdoc/ and https://www.gov.uk/guidance/apply-for-hm-land-registry-business-e-services
- Standard commercial terms: https://www.gov.uk/government/publications/hm-land-registry-commercial-services-terms-and-conditions/standard-terms-and-conditions-for-hm-land-registry-commercial-products-and-services-the-standard-terms

Other government and open data
- VOA rating list downloads and terms: https://voaratinglists.blob.core.windows.net/html/rlidata.htm
- EPC open data: https://get-energy-performance-data.communities.gov.uk/ and https://epc.opendatacommunities.org/docs/api
- DfT road traffic statistics: https://roadtraffic.dft.gov.uk/ and https://ckan.publishing.service.gov.uk/dataset/gb-road-traffic-counts
- WebTRIS: https://findtransportdata.dft.gov.uk/dataset/webtris-traffic-flow-api
- Planning Data platform: https://www.planning.data.gov.uk/docs
- PlanIt aggregator: https://www.planit.org.uk/
- Companies House API rate limits: https://developer-specs.company-information.service.gov.uk/guides/rateLimiting
- The Gazette data service: https://www.thegazette.co.uk/all-notices/content/103871
- Environment Agency LIDAR composite: https://www.data.gov.uk/dataset/cf3f1137-c12b-44a1-a835-e80fe4a60b92/lidar-composite-digital-surface-model-dsm-1m
- FSA Food Hygiene Ratings open data: https://ratings.food.gov.uk/open-data/
- Brownfield registers example: https://open.barnet.gov.uk/dataset/brownfield-land-register
- SSEN and UKPN open data portals: https://data.ssen.co.uk/ and https://ukpowernetworks.opendatasoft.com/
- OS Data Hub plans and pricing: https://osdatahub.os.uk/plans
- OS NGD Buildings: https://docs.os.uk/osngd/data-structure/buildings

Footfall and market data vendors
- Huq store and products: https://huq.io/store/ and https://datarade.ai/data-providers/huq/profile
- BT Footfall API: https://developer.bt.com/products/footfall-data
- Citi Logik footfall via DfT: https://findtransportdata.dft.gov.uk/dataset/footfall-counter-(mobile-network-data)-1831d35d12c
- Council open footfall: https://www.data.gov.uk/dataset/6449d8f5-76e7-4aff-bfb1-46d46542a56c/footfall
- Searchland pricing and API credits: https://searchland.co.uk/pricing , https://searchland.co.uk/api , https://docs.searchland.co.uk/

Christie & Co and sector registers
- Christie & Co about and sectors: https://www.christie.com/about/ and https://www.christiegroup.com/our-businesses/christie-and-co
- Business Outlook 2026: https://www.christie.com/news-resources/business-outlook-2026/
- Christie Group 2025 preliminary results: https://www.ticker.app/lse/CTG/rns/2026-04-27/Preliminary-Results/9042B
- Care Market Review 2026 announcement: https://www.investegate.co.uk/announcement/rns/christie-group--ctg/christie-co-publishes-care-market-review-2026/9789190
- CQC data and API: https://www.cqc.org.uk/about-us/transparency/using-cqc-data
- Ofsted Registered Childcare dataset: https://www.data.gov.uk/dataset/1889ff52-5455-4980-ba74-15bb1edb4b60/childcare-providers-and-places and methodology https://www.gov.uk/government/statistics/childcare-providers-and-inspections-as-at-31-march-2025/methodology-childcare-providers-and-inspections-as-at-31-march-2025
- NHSBSA Consolidated Pharmaceutical List: https://opendata.nhsbsa.net/dataset/consolidated-pharmaceutical-list and dispensing data https://opendata.nhsbsa.net/dataset/25230765-9494-4fde-b3fc-af9c00037dfb
- GPhC registers data: https://www.pharmacyregulation.org/about-us/research/gphc-registers-data
- NHS Scotland dental practices: https://www.opendata.nhs.scot/dataset/dental-practices-and-patient-registrations
- Council premises licence registers on data.gov.uk: https://www.data.gov.uk/search?q=premises

Record linkage
- Splink: https://www.gov.uk/government/publications/joined-up-data-in-government-the-future-of-data-linking-methods/splink-mojs-open-source-library-for-probabilistic-record-linkage-at-scale
- UK GDPR legitimate interests commentary: https://www.thorntons-law.co.uk/knowledge/data-protection-update-on-direct-marketing

Notes on verification: nimbusmaps.co.uk could not be fetched directly from this environment, so Nimbus feature and pricing statements come from search-engine extracts of its pages and third-party listings. Prices marked as third-party or older should be confirmed with a quote before budgeting.
