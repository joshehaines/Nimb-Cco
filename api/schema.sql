-- Christie Property Intelligence: PostGIS schema (phase 2 backend).
-- Mirrors src/data/types.ts. Every source table carries source, licence and fetched_at.
-- Run: psql "$DATABASE_URL" -f api/schema.sql

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE licence_class AS ENUM ('OGL','HMLR-CCOD','HMLR-Doc','VOA-Restricted','OS','Vendor','Internal');

-- ---------------------------------------------------------------- HM Land Registry
CREATE TABLE titles (
  title_number        text PRIMARY KEY,
  inspire_id          bigint UNIQUE,
  tenure              text NOT NULL DEFAULT 'Freehold',
  address             text,
  postcode            text,
  uprn                bigint,
  geom                geometry(MultiPolygon, 4326),
  area_sqm            numeric,
  price_paid          integer,
  price_paid_date     date,
  date_proprietor_added date,
  register_purchased  boolean NOT NULL DEFAULT false,
  title_plan_purchased boolean NOT NULL DEFAULT false,
  source              text NOT NULL,
  licence             licence_class NOT NULL,
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX titles_geom_gix ON titles USING gist (geom);
CREATE INDEX titles_uprn_idx ON titles (uprn);
CREATE INDEX titles_postcode_idx ON titles (postcode);

CREATE TABLE proprietors (
  id                  bigserial PRIMARY KEY,
  title_number        text REFERENCES titles ON DELETE CASCADE,
  seq                 smallint NOT NULL,
  name                text NOT NULL,
  category            text NOT NULL,
  company_number      text,
  address             text,
  redacted            boolean NOT NULL DEFAULT false,   -- true for private individuals until register purchased
  source              text NOT NULL,
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proprietors_company_idx ON proprietors (company_number);
CREATE INDEX proprietors_name_trgm ON proprietors USING gin (name gin_trgm_ops);
CREATE INDEX titles_address_trgm ON titles USING gin (address gin_trgm_ops);   -- /api/search address leg

CREATE TABLE leases (
  lease_id            text PRIMARY KEY,
  freehold_title      text REFERENCES titles,
  leasehold_title     text,
  date_of_lease       date,
  term_years          numeric,
  term_description    text,
  expiry_date         date,
  premium             integer,
  lessee              text,
  alienation_clause   boolean,
  parsed              jsonb,                             -- ParsedLease from the extraction job
  source              text NOT NULL,
  licence             licence_class NOT NULL,
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leases_expiry_idx ON leases (expiry_date);

CREATE TABLE title_charges (
  title_number text REFERENCES titles ON DELETE CASCADE,
  lender       text,
  charge_date  date
);

-- ------------------------------------------------------------------ Companies House
CREATE TABLE companies (
  company_number      text PRIMARY KEY,
  name                text NOT NULL,
  status              text NOT NULL,
  incorporated        date,
  sic_codes           text[],
  registered_address  text,
  accounts_overdue    boolean NOT NULL DEFAULT false,
  last_accounts_made_up_to date,
  parent_company_number text,
  officers            jsonb NOT NULL DEFAULT '[]',
  pscs                jsonb NOT NULL DEFAULT '[]',
  charges             jsonb NOT NULL DEFAULT '[]',
  gazette_notices     jsonb NOT NULL DEFAULT '[]',
  source              text NOT NULL DEFAULT 'Companies House',
  licence             licence_class NOT NULL DEFAULT 'OGL',
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_name_trgm ON companies USING gin (name gin_trgm_ops);
CREATE INDEX companies_parent_idx ON companies (parent_company_number);

-- -------------------------------------------------------------------------- VOA
-- The Gazette corporate insolvency notices (ingest/gazette.py), matched to companies by normalised name.
CREATE TABLE gazette_notices (
  notice_id      text PRIMARY KEY,
  notice_code    text,
  category       text,
  company_name   text,
  company_number text REFERENCES companies,
  published      timestamptz,
  lat            double precision,
  lon            double precision,
  link           text,
  snippet        text,
  fetched_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gazette_notices_company_idx ON gazette_notices (company_number);

CREATE TABLE hereditaments (
  uarn                text PRIMARY KEY,
  uprn                bigint,
  address             text,
  postcode            text,
  description         text,
  scat_code           text,
  rateable_value      integer,
  list_year           smallint,
  total_area_sqm      numeric,
  floors              jsonb,
  effective_date      date,
  deleted             boolean NOT NULL DEFAULT false,
  source              text NOT NULL DEFAULT 'VOA',
  licence             licence_class NOT NULL DEFAULT 'VOA-Restricted',
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hereditaments_uprn_idx ON hereditaments (uprn);
CREATE INDEX hereditaments_postcode_idx ON hereditaments (postcode);
CREATE INDEX hereditaments_scat_idx ON hereditaments (scat_code);

-- -------------------------------------------------------------------------- EPC
CREATE TABLE epcs (
  certificate_id      text PRIMARY KEY,
  uprn                bigint,
  address             text,
  postcode            text,
  kind                text NOT NULL,                     -- non-domestic | domestic | DEC
  rating              text,
  score               integer,                          -- non-domestic asset ratings run past int16 (negative for net exporters)
  floor_area_sqm      numeric,
  lodged_at           date,
  expires_at          date,
  main_heating        text,
  source              text NOT NULL DEFAULT 'MHCLG EPC',
  licence             licence_class NOT NULL DEFAULT 'OGL',
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX epcs_uprn_idx ON epcs (uprn);

-- ---------------------------------------------------------------------- Planning
CREATE TABLE planning_applications (
  reference           text,
  authority           text,
  address             text,
  postcode            text,
  geom                geometry(Point, 4326),
  description         text,
  applicant           text,
  agent               text,
  type                text,
  status              text,
  received_date       date,
  decision_date       date,
  portal_url          text,
  summary             text,
  source              text NOT NULL,
  licence             licence_class NOT NULL DEFAULT 'OGL',
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (authority, reference)
);
CREATE INDEX planning_geom_gix ON planning_applications USING gist (geom);
CREATE INDEX planning_address_trgm ON planning_applications USING gin (address gin_trgm_ops);
CREATE INDEX planning_received_idx ON planning_applications (received_date DESC);

CREATE TABLE planning_titles (
  authority    text,
  reference    text,
  title_number text REFERENCES titles,
  PRIMARY KEY (authority, reference, title_number)
);

CREATE TABLE constraints (
  id                  text PRIMARY KEY,
  kind                text NOT NULL,
  name                text,
  grade               text,
  geom                geometry(Geometry, 4326),
  source              text NOT NULL,
  licence             licence_class NOT NULL DEFAULT 'OGL',
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX constraints_geom_gix ON constraints USING gist (geom);

-- ---------------------------------------------------------------------- Mobility
CREATE TABLE traffic_counts (
  count_point_id      text PRIMARY KEY,
  road_name           text,
  road_type           text,
  geom                geometry(Point, 4326),
  year                smallint,
  method              text,
  aadf                integer,
  cars                integer,
  lgv                 integer,
  hgv                 integer,
  pedal_cycles        integer,
  history             jsonb,
  source              text NOT NULL DEFAULT 'DfT Road Traffic Statistics',
  licence             licence_class NOT NULL DEFAULT 'OGL',
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX traffic_geom_gix ON traffic_counts USING gist (geom);

CREATE TABLE footfall_cells (
  h3                  text,
  month               date,
  geom                geometry(Polygon, 4326),
  monthly_visits      integer,
  band                smallint,
  trend_12m           numeric,
  dwell_minutes       numeric,
  source              text NOT NULL,
  licence             licence_class NOT NULL DEFAULT 'Vendor',
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (h3, month)
);
CREATE INDEX footfall_geom_gix ON footfall_cells USING gist (geom);

-- ------------------------------------------------------------ Sector registers
CREATE TABLE register_records (
  register            text NOT NULL,                     -- CQC | Ofsted | NHSBSA | GPhC | FSA | Premises Licence | DfE
  register_id         text NOT NULL,
  name                text,
  provider_name       text,
  provider_id         text,
  status              text,
  registered_at       date,
  deregistered_at     date,
  rating              text,
  rating_date         date,
  capacity            integer,
  capacity_label      text,
  address             text,
  postcode            text,
  uprn                bigint,
  geom                geometry(Point, 4326),
  extra               jsonb,
  source              text NOT NULL,
  licence             licence_class NOT NULL DEFAULT 'OGL',
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (register, register_id)
);
CREATE INDEX register_uprn_idx ON register_records (uprn);
CREATE INDEX register_postcode_idx ON register_records (postcode);
CREATE INDEX register_geom_gix ON register_records USING gist (geom);
CREATE INDEX register_name_trgm ON register_records USING gin (name gin_trgm_ops);

-- ------------------------------------------------------------- Trading businesses
-- Composite entity assembled by the linkage job from registers + VOA + titles + companies.
CREATE TABLE businesses (
  business_id         text PRIMARY KEY,
  name                text NOT NULL,
  sector              text NOT NULL,
  sub_sector          text,
  address             text,
  postcode            text,
  uprn                bigint,
  geom                geometry(Point, 4326),
  title_number        text REFERENCES titles,
  tenure              text,
  operator_company_number text REFERENCES companies,
  operator_name       text,
  freeholder_name     text,
  freeholder_company_number text,
  hereditament_uarn   text REFERENCES hereditaments,
  epc_certificate_id  text REFERENCES epcs,
  fhrs_rating         smallint,
  distress_flags      text[] NOT NULL DEFAULT '{}',
  crm_record_id       text,
  source              text NOT NULL DEFAULT 'Composite',
  licence             licence_class NOT NULL DEFAULT 'Internal',
  fetched_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX businesses_geom_gix ON businesses USING gist (geom);
CREATE INDEX businesses_sector_idx ON businesses (sector);
CREATE INDEX businesses_operator_idx ON businesses (operator_company_number);
CREATE INDEX businesses_name_trgm ON businesses USING gin (name gin_trgm_ops);
CREATE INDEX businesses_title_idx ON businesses (title_number) WHERE title_number IS NOT NULL;   -- the map titles layer looks businesses up by title
CREATE INDEX businesses_address_trgm ON businesses USING gin (address gin_trgm_ops);   -- /api/search address and area legs

CREATE TABLE business_registers (
  business_id text REFERENCES businesses ON DELETE CASCADE,
  register    text,
  register_id text,
  PRIMARY KEY (business_id, register, register_id),
  FOREIGN KEY (register, register_id) REFERENCES register_records
);

-- ---------------------------------------------------------- Alerts, watchlists, docs
CREATE TABLE users (
  user_id   text PRIMARY KEY,                             -- SSO subject
  email     text UNIQUE,
  office    text
);

-- Local sign-in accounts (pilot mode without single sign-on). See app/accounts.py.
CREATE TABLE accounts (
  user_id       text PRIMARY KEY REFERENCES users,
  email         text UNIQUE NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  roles         text[] NOT NULL DEFAULT '{agent}',
  office        text,
  must_reset    boolean NOT NULL DEFAULT true,
  disabled      boolean NOT NULL DEFAULT false,
  token_version integer NOT NULL DEFAULT 0,                  -- bump to sign a user out everywhere
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text,
  last_login_at timestamptz
);

CREATE TABLE watch_items (
  id          bigserial PRIMARY KEY,
  user_id     text REFERENCES users,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  label       text,
  notes       text,
  radius_m    integer,
  project     text,
  added_at    timestamptz NOT NULL DEFAULT now(),
  extra       jsonb NOT NULL DEFAULT '{}'::jsonb,            -- pipeline stage, fee estimate, assignee and so on
  UNIQUE (user_id, entity_type, entity_id)
);

CREATE TABLE alerts (
  alert_id    bigserial PRIMARY KEY,
  user_id     text REFERENCES users,
  kind        text NOT NULL,
  title       text NOT NULL,
  detail      text,
  occurred_at timestamptz NOT NULL,
  severity    text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  sector      text,
  read        boolean NOT NULL DEFAULT false
);
CREATE INDEX alerts_user_idx ON alerts (user_id, read, occurred_at DESC);

CREATE TABLE document_orders (
  order_id        text PRIMARY KEY,
  title_number    text REFERENCES titles,
  kind            text NOT NULL,                          -- Register | Title Plan | Lease | Deed
  fee             numeric NOT NULL DEFAULT 7,
  ordered_by      text REFERENCES users,
  ordered_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'Queued',
  file_name       text,
  storage_key     text,
  parsed_summary  text,
  parsed          jsonb,
  UNIQUE (title_number, kind)                             -- never buy the same document twice
);

-- --------------------------------------------------------------------- CRM
CREATE TABLE crm_records (
  record_id     text PRIMARY KEY,
  snapshot_date date NOT NULL,
  office        text,
  business_name text,
  address       text,
  postcode      text,
  contact_name  text,
  company_name  text,
  company_number text,
  sector        text,
  tenure        text,
  capacity      integer,
  last_contact  date,
  owner         text,
  raw           jsonb
);

CREATE TABLE crm_matches (
  record_id     text REFERENCES crm_records,
  business_id   text REFERENCES businesses,
  title_number  text,
  uprn          bigint,
  company_number text,
  register      text,
  register_id   text,
  confidence    numeric,
  reasons       text[],
  issues        text[],
  decision      text,                                     -- accepted | rejected | null
  decided_by    text REFERENCES users,
  decided_at    timestamptz,
  PRIMARY KEY (record_id)
);

CREATE TABLE data_sources (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  provider  text,
  licence   licence_class NOT NULL,
  cadence   text,
  last_run  timestamptz,
  next_run  timestamptz,
  status    text NOT NULL DEFAULT 'not-configured',
  records   bigint,
  note      text,
  docs_url  text
);

-- Snapshot tables used by the alert generator to diff proprietors and register ratings between runs.
CREATE TABLE snapshot_proprietors (LIKE proprietors INCLUDING ALL);
CREATE TABLE snapshot_register_records (LIKE register_records INCLUDING ALL);

-- ---------------------------------------------------------------- Collected open data (phase 2a)
-- Real datasets gathered by scripts/data and loaded by ingest.open_data. Overture tables are ODbL /
-- CDLA-Permissive; attribution is carried in source.
CREATE TABLE places (
  place_id      text PRIMARY KEY,
  name          text,
  category      text,
  sector        text,
  confidence    real,
  address       text,
  postcode      text,
  locality      text,
  website       text,
  phone         text,
  brand         text,
  geom          geometry(Point, 4326) NOT NULL,
  source        text NOT NULL DEFAULT 'Overture Maps places (CDLA-Permissive-2.0)',
  licence       licence_class NOT NULL DEFAULT 'OGL',
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX places_geom_gix ON places USING gist (geom);
CREATE INDEX places_sector_idx ON places (sector);
CREATE INDEX places_postcode_idx ON places (postcode);

CREATE TABLE roads (
  road_id       text PRIMARY KEY,
  name          text,
  class         text,
  major         boolean NOT NULL DEFAULT false,
  geom          geometry(Geometry, 4326) NOT NULL,
  source        text NOT NULL DEFAULT 'Overture Maps transportation (ODbL, OpenStreetMap contributors)',
  licence       licence_class NOT NULL DEFAULT 'OGL',
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX roads_geom_gix ON roads USING gist (geom);

CREATE TABLE buildings (
  building_id   text PRIMARY KEY,
  name          text,
  class         text,
  subtype       text,
  height_m      real,
  levels        smallint,
  geom          geometry(Geometry, 4326) NOT NULL,
  source        text NOT NULL DEFAULT 'Overture Maps buildings (ODbL)',
  licence       licence_class NOT NULL DEFAULT 'OGL',
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buildings_geom_gix ON buildings USING gist (geom);

CREATE TABLE price_paid (
  transaction_id text PRIMARY KEY,
  price          bigint NOT NULL,
  sale_date      date NOT NULL,
  postcode       text,
  property_type  char(1) NOT NULL,          -- D S T F O
  new_build      boolean NOT NULL DEFAULT false,
  tenure         text,
  address        text,
  locality       text,
  town           text,
  district       text,
  county         text,
  ppd_category   char(1) NOT NULL DEFAULT 'A',
  geocode        text,                      -- postcode | sector | uprn | null
  geom           geometry(Point, 4326),
  source         text NOT NULL DEFAULT 'HMLR Price Paid',
  licence        licence_class NOT NULL DEFAULT 'OGL',
  fetched_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_paid_geom_gix ON price_paid USING gist (geom);
CREATE INDEX price_paid_postcode_idx ON price_paid (postcode);
CREATE INDEX price_paid_date_idx ON price_paid (sale_date);
CREATE INDEX price_paid_type_idx ON price_paid (property_type);

CREATE TABLE postcode_centroids (
  postcode   text PRIMARY KEY,
  geom       geometry(Point, 4326) NOT NULL,
  method     text NOT NULL DEFAULT 'overture-places',   -- replace with ONSPD / AddressBase once licensed
  samples    integer
);
CREATE INDEX postcode_centroids_geom_gix ON postcode_centroids USING gist (geom);
CREATE INDEX postcode_centroids_sector_idx ON postcode_centroids (left(postcode, length(postcode) - 2));

INSERT INTO data_sources (id, name, provider, licence, cadence, status, docs_url) VALUES
  ('overture-places', 'Places (Overture Maps)', 'Overture Maps Foundation', 'OGL', 'Monthly release', 'not-configured', 'https://docs.overturemaps.org/guides/places/'),
  ('overture-roads', 'Road network (Overture Maps)', 'Overture Maps Foundation', 'OGL', 'Monthly release', 'not-configured', 'https://docs.overturemaps.org/guides/transportation/'),
  ('overture-buildings', 'Building footprints (Overture Maps)', 'Overture Maps Foundation', 'OGL', 'Monthly release', 'not-configured', 'https://docs.overturemaps.org/guides/buildings/'),
  ('hmlr-ppd', 'HM Land Registry price paid', 'HM Land Registry', 'OGL', 'Monthly', 'not-configured', 'https://www.gov.uk/government/collections/price-paid-data'),
  ('dft-aadf', 'DfT traffic counts', 'Department for Transport', 'OGL', 'Annual', 'not-configured', 'https://roadtraffic.dft.gov.uk/downloads')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- Audit trail
-- Who ordered which document, exported which list, approved which campaign. Append-only.
CREATE TABLE audit_log (
  event_id    text PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  user_id     text NOT NULL,
  user_name   text,
  kind        text NOT NULL,
  summary     text NOT NULL,
  entity_type text,
  entity_id   text,
  licences    text[] NOT NULL DEFAULT '{}',
  count       integer
);
CREATE INDEX audit_log_at_idx ON audit_log (at desc);
CREATE INDEX audit_log_user_idx ON audit_log (user_id, at desc);

-- ---------------------------------------------------------------- alerts: rules, channels, deliveries
-- Rules are stored as the JSON the UI edits (conditions, scope, recipients, channels, frequency);
-- the worker (api/alerts/worker.py) evaluates them with the same logic as src/lib/alerts.ts.
CREATE TABLE staff (
  id      text PRIMARY KEY,                                  -- identity-provider object id
  name    text NOT NULL,
  email   text NOT NULL,
  mobile  text,
  office  text,
  team    text,
  role    text NOT NULL DEFAULT 'agent'
);
CREATE TABLE alert_rules (
  rule_id       text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users,
  name          text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  body          jsonb NOT NULL,                              -- AlertRule as saved by the UI
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz,
  fired_count   integer NOT NULL DEFAULT 0
);
CREATE INDEX alert_rules_user_idx ON alert_rules (user_id);
CREATE TABLE notification_prefs (
  user_id        text PRIMARY KEY REFERENCES users,
  email          text NOT NULL DEFAULT '',
  email_verified boolean NOT NULL DEFAULT false,
  mobile         text NOT NULL DEFAULT '',
  mobile_verified boolean NOT NULL DEFAULT false,
  teams_webhook  text NOT NULL DEFAULT '',
  quiet_enabled  boolean NOT NULL DEFAULT true,
  quiet_from     text NOT NULL DEFAULT '21:00',
  quiet_to       text NOT NULL DEFAULT '07:00',
  digest_hour    integer NOT NULL DEFAULT 8,
  weekly_day     integer NOT NULL DEFAULT 1,
  timezone       text NOT NULL DEFAULT 'Europe/London',
  pending_code   text,                                       -- verification code in flight
  pending_channel text
);
CREATE TABLE alert_deliveries (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  rule_id   text REFERENCES alert_rules ON DELETE SET NULL,
  user_id   text,
  channel   text NOT NULL,                                   -- inapp | email | sms | teams
  to_addr   text,
  to_name   text,
  alert_ids text[] NOT NULL,
  subject   text,
  body      text,
  status    text NOT NULL,                                   -- sent | simulated | suppressed | deferred | failed
  note      text
);
CREATE INDEX alert_deliveries_at_idx ON alert_deliveries (at desc);
CREATE TABLE alert_rule_sent (                              -- dedupe ledger: one message per rule per event
  rule_id  text REFERENCES alert_rules ON DELETE CASCADE,
  alert_id text,
  sent_at  timestamptz NOT NULL,
  PRIMARY KEY (rule_id, alert_id)
);
CREATE TABLE alert_state (                                  -- per-user triage of an event
  user_id       text NOT NULL,
  alert_id      text NOT NULL,
  read          boolean NOT NULL DEFAULT false,
  snoozed_until timestamptz,
  assigned_to   text,
  notes         text,
  dismissed     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, alert_id)
);
-- Context columns the matcher needs on each alert.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS title_number text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS postcode text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS lon double precision;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS deal_score integer;
-- Real-business pins sit at the centre of the building they belong to (placed = 'building'), or at
-- the listed point when no footprint is within 30 m. Run after each places or buildings load.
ALTER TABLE places ADD COLUMN IF NOT EXISTS placed text NOT NULL DEFAULT 'listed';
ALTER TABLE places ADD COLUMN IF NOT EXISTS listed_geom geometry(Point, 4326);
CREATE OR REPLACE FUNCTION snap_places_to_buildings(snap_m double precision DEFAULT 30) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  UPDATE places p SET listed_geom = coalesce(p.listed_geom, p.geom) WHERE p.listed_geom IS NULL;
  WITH hit AS (
    SELECT DISTINCT ON (p.place_id) p.place_id, st_pointonsurface(b.geom) AS centre
    FROM places p
    JOIN buildings b ON st_dwithin(b.geom::geography, p.listed_geom::geography, snap_m)
    ORDER BY p.place_id, st_contains(b.geom, p.listed_geom) DESC, st_distance(b.geom::geography, p.listed_geom::geography)
  )
  UPDATE places p SET geom = h.centre, placed = 'building' FROM hit h WHERE h.place_id = p.place_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
-- Watched sites with a centre for radius scopes.
CREATE VIEW watch_items_with_centre AS
  SELECT w.*, coalesce(b.geom, st_centroid(t.geom)) AS centre
  FROM watch_items w
  LEFT JOIN businesses b ON w.entity_type = 'business' AND b.business_id = w.entity_id
  LEFT JOIN titles t ON w.entity_type = 'title' AND t.title_number = w.entity_id;
