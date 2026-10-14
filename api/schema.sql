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
  score               smallint,
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
CREATE INDEX postcode_centroids_sector_idx ON postcode_centroids (left(postcode, length(postcode) - 2));

INSERT INTO data_sources (id, name, provider, licence, cadence, status, docs_url) VALUES
  ('overture-places', 'Places (Overture Maps)', 'Overture Maps Foundation', 'OGL', 'Monthly release', 'not-configured', 'https://docs.overturemaps.org/guides/places/'),
  ('overture-roads', 'Road network (Overture Maps)', 'Overture Maps Foundation', 'OGL', 'Monthly release', 'not-configured', 'https://docs.overturemaps.org/guides/transportation/'),
  ('overture-buildings', 'Building footprints (Overture Maps)', 'Overture Maps Foundation', 'OGL', 'Monthly release', 'not-configured', 'https://docs.overturemaps.org/guides/buildings/'),
  ('hmlr-ppd', 'HM Land Registry price paid', 'HM Land Registry', 'OGL', 'Monthly', 'not-configured', 'https://www.gov.uk/government/collections/price-paid-data'),
  ('dft-aadf', 'DfT traffic counts', 'Department for Transport', 'OGL', 'Annual', 'not-configured', 'https://roadtraffic.dft.gov.uk/downloads')
ON CONFLICT (id) DO NOTHING;
