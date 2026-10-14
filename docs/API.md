# Backend API contract

The UI's `HttpProvider` (`src/data/http/HttpProvider.ts`) calls these endpoints. Response shapes are the TypeScript types in `src/data/types.ts`, serialised as JSON. All endpoints sit under `/api`, require the company SSO session cookie, and return `404` for unknown IDs.

Backend: FastAPI + PostgreSQL/PostGIS. Suggested tables: `titles`, `proprietors`, `leases`, `companies`, `hereditaments`, `epcs`, `planning_applications`, `constraints`, `traffic_counts`, `footfall_cells`, `register_records`, `businesses`, `alerts`, `document_orders`, `data_sources`, `crm_records`, `crm_matches`.

| Method | Path | Params / body | Returns |
|---|---|---|---|
| GET | `/search` | `q`, `limit` | `SearchResult[]` |
| GET | `/map/layers` | `bbox=w,s,e,n` | `MapLayers` (six GeoJSON FeatureCollections). Use ST_Intersects on the bbox; cap titles at ~5,000 and switch to vector tiles (`/tiles/{layer}/{z}/{x}/{y}.pbf` via pg_tileserv) above that. |
| GET | `/titles/{titleNumber}` | | `Title` (proprietors redacted unless register purchased) |
| GET | `/titles/{titleNumber}/businesses` | | `Business[]` |
| GET | `/titles/{titleNumber}/voa` | | `Hereditament[]` |
| GET | `/titles/{titleNumber}/epc` | | `EPC[]` |
| GET | `/titles/{titleNumber}/planning` | `radius` (m, optional) | `PlanningApplication[]` |
| GET | `/titles/{titleNumber}/constraints` | | `Constraint[]` |
| GET | `/titles/{titleNumber}/leases` | | `LeaseSummary[]` |
| GET | `/businesses/{id}` | | `Business` |
| GET | `/companies/{number}` | | `Company` |
| GET | `/companies/{number}/group` | | `Company[]` (root and subsidiaries via PSC) |
| GET | `/companies/{number}/titles` | | `Title[]` |
| GET | `/companies/{number}/businesses` | | `Business[]` |
| GET | `/voa/{uarn}` | | `Hereditament` |
| GET | `/epc/{certificateId}` | | `EPC` |
| GET | `/planning/{reference}` | | `PlanningApplication` |
| GET | `/traffic` | `lon`, `lat`, `radius` | `TrafficCount[]` |
| GET | `/footfall` | `lon`, `lat`, `radius` | `FootfallCell[]` |
| POST | `/sourcing/businesses` | `{ filters: SourcingFilters, bounds? }` | `Business[]` |
| POST | `/sourcing/titles` | `{ filters, bounds? }` | `Title[]` |
| POST | `/comparables/search` | `{ filters: ComparableFilters }` | `{ comps: Comparable[], stats: ComparableStats }` |
| GET | `/comparables/{id}` | | `Comparable` |
| GET | `/catchment` | `lon`, `lat`, `radius` | `Catchment` (demographics, competitor supply, ratios, `realSupply` from collected places) |
| GET | `/places` | `lon`, `lat`, `radius`, `sector?` | Real places (Overture Maps) within the radius, nearest first |
| GET | `/places/:id` | | One real place with its location |
| GET | `/titles/at` | `lon`, `lat` | The title whose extent contains the point (ST_Contains), or 404 |
| GET | `/businesses/near` | `lon`, `lat`, `radius`, `sector?` | Registered/demo businesses within the radius, nearest first, each with `distanceM` (competition analysis) |
| GET | `/price-paid` | `lon`, `lat`, `radius`, `type=O?`, `limit?` | HM Land Registry price paid transactions within the radius |
| GET | `/price-paid/:id` | | One transaction |
| GET | `/traffic` | `lon`, `lat`, `radius`, `limit?` | DfT count points within the radius with AADF history |
| GET | `/map/open-data` | `bbox`, `buildings?` | Real layers for the viewport: `poi`, `pricePaid` and optionally `buildings` feature collections |
| GET | `/admin/sources` | | Data source status rows, including the collected open data |
| GET | `/alerts` | | `Alert[]` (newest first), each with `businessId`, `titleNumber`, `postcode`, `location` for rule matching |
| POST | `/alerts/{id}/read` | | `{}` |
| GET | `/alerts/rules` | | `AlertRule[]` the caller owns or is a recipient of |
| PUT | `/alerts/rules/{id}` | body `AlertRule` | Create or update (owner or admin only) |
| DELETE | `/alerts/rules/{id}` | | Remove |
| POST | `/alerts/rules/{id}/test` | body `AlertRule` (unsaved is fine) | Dry run against the last 40 days: `{matched, total, results[{alertId, title, match, reasons}]}` |
| GET | `/alerts/deliveries` | `limit?` | Every message sent for the caller's rules (compliance sees all): channel, recipient, status, subject, body |
| GET / PUT | `/alerts/state/{alertId}` | body `{read, snoozedUntil, assignedTo, notes, dismissed}` | Per-user triage of an event |
| GET / PUT | `/me/notifications` | body `NotificationPrefs` | Email, mobile, Teams webhook, quiet hours, digest time. Changing an address clears its verified flag |
| POST | `/me/notifications/verify` | `{channel: 'email' \| 'sms'}` | Sends a six-digit code over that channel |
| POST | `/me/notifications/confirm` | `{code}` | Marks the channel verified |
| GET | `/auth/mode` | | `{mode: 'oidc' \| 'local' \| 'demo'}` |
| POST | `/auth/login` | `{email, password}` | Local accounts: `{token, user}`; token is a 12-hour HS256 session |
| POST | `/auth/password` | `{current, new}` | Change own password; returns a fresh token and clears the first-sign-in flag |
| GET / POST | `/admin/users` | body `{name, email, roles?, office?}` | Admin: list accounts; create one and receive `temporaryPassword` once |
| POST | `/admin/users/{id}/reset` | | Admin: new temporary password, ends their sessions |
| POST | `/admin/users/{id}/disabled` | `{disabled}` | Admin: disable or re-enable |
| PUT | `/admin/users/{id}` | `{name?, roles?, office?}` | Admin: edit |
| POST | `/assistant` | `{messages, tools, context}` | Claude relay for the in-app assistant: returns Messages API content blocks (text or tool_use); tools run in the browser and results come back as the next turn. 503 until `ANTHROPIC_API_KEY` is set |
| GET | `/staff` | | Colleagues who can be added to an alert (synced from the identity provider) |
| POST | `/documents/orders` | `{ titleNumber, kind }` | `DocumentOrder` (status transitions Queued → Downloading → Stored → Parsed) |
| GET | `/documents/orders` | | `DocumentOrder[]` |
| POST | `/crm/match` | `{ records: CrmRecord[] }` | `MatchCandidate[]` |
| POST | `/crm/duplicates` | `{ records: CrmRecord[] }` | `DuplicateGroup[]` |
| GET | `/crm/sample.csv` | | text/csv |
| GET | `/admin/sources` | | `DataSourceStatus[]` |

## Behavioural notes

- **Licence enforcement.** Every entity carries `source`, `fetchedAt`, `licence`. `GET /titles` must return `redacted: true` for private individuals until an official copy has been purchased for that title. CSV exports from `/sourcing` include a licence header line.
- **Document orders** call HMLR Business Gateway (OC1 for register and plan, OC2 for lease and deeds) with the firm's client certificate, store the PDF once per `(titleNumber, kind)`, and queue an extraction job. The extraction job writes `ParsedLease` fields with a confidence score; anything below 0.7 is flagged for human check.
- **CRM match** should implement the same pipeline as `MockProvider.matchCrmRecords` but with OS Places for UPRN resolution, Companies House search for company resolution, and Splink weights trained on accepted matches. Keep the response shape identical so the UI does not change.
- **Alerts** are generated by the ingestion jobs as diffs against the previous snapshot (CCOD proprietor change, Companies House status, filing or charge, Gazette notices, CQC/Ofsted/FSA rating change or enforcement, planning received or decided, lease events, EPC lodged, VOA list change, price paid, new competitors, deal-score band changes, licence reviews). **Delivery** is the worker in `api/alerts/worker.py`: it evaluates each user's rules (`api/alerts/matcher.py`, the same logic as `src/lib/alerts.ts`) against new events, groups them by recipient, channel and digest frequency, honours quiet hours, sends by SMTP, Twilio (or any SMS webhook) and Teams incoming webhooks, and records every message in `alert_deliveries` with `alert_rule_sent` as the dedupe ledger. Run it with `python -m alerts.worker --once` after each load or `--loop 300` under compose; `ALERTS_DRY_RUN=1` writes deliveries without sending.
- **Map layers** must be cheap. Titles and footfall are best served as vector tiles; businesses, planning and traffic as bbox GeoJSON.
