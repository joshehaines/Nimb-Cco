#!/usr/bin/env bash
# Download every bulk source the platform ingests, from a machine with ordinary internet access,
# then load them with the loaders in api/ingest (python -m ingest.run <job> --workdir <this dir>).
# Free accounts are needed where marked. Re-running skips files already downloaded, so it is safe to
# resume after a failure; delete a file to fetch it again. One failing source does not stop the rest.
#
#   export HMLR_API_KEY=...        # use-land-property-data.service.gov.uk  (free; CCOD/OCOD licence accepted online)
#   export EPC_TOKEN=...           # get-energy-performance-data.communities.gov.uk (free; GOV.UK One Login, token on My account)
#   export CH_MONTH=2026-10-01     # Companies House basic data file date (first of the month)
#   export INSPIRE_AREAS="Warwick Bristol_City ..."   # optional: override the local authority list below
#   export FSA_AREAS="373 324 ..."                    # optional: FSA authority ids (https://api.ratings.food.gov.uk/Authorities/basic)
#   export SKIP_FLOOD=1                               # optional: skip the 2 GB flood-risk-zone file
#   ./fetch_sources.sh raw/
#
# Afterwards (from the repository root, with the stack running):
#   for job in hmlr_inspire hmlr_ccod cqc ofsted fsa nhsbsa voa epc companies_house planning_pdg hmlr_ppd dft_aadf; do
#     docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile load run --rm loader python -m ingest.run $job --workdir /raw
#   done
set -uo pipefail
EPC_AUTH="${EPC_AUTH:-}"
OUT="${1:-raw}"; mkdir -p "$OUT"; cd "$OUT"
JAR="$(pwd)/.cookies.txt"; : > "$JAR"
UA="Mozilla/5.0 (compatible; PropertyIntelligence/0.1; data load)"
FAILED=()
log() { echo "[$(date +%H:%M:%S)] $*"; }
# get URL FILE [curl args...]: resumable download to FILE, skipped when FILE already exists and is not empty.
get() {
  local url="$1" file="$2"; shift 2
  if [ -s "$file" ]; then log "have $file"; return 0; fi
  log "-> $file"
  if curl -sSL --fail --retry 3 --retry-delay 10 -A "$UA" -c "$JAR" -b "$JAR" -o "$file.part" "$@" "$url"; then
    mv "$file.part" "$file"
  else
    rm -f "$file.part"; log "FAILED $file ($url)"; FAILED+=("$file"); return 1
  fi
}
py() { python3 -I -c "$@"; }

# HM Land Registry -----------------------------------------------------------------------------
# INSPIRE index polygons: one zip per local authority (no account; the site sets a cookie then redirects to S3).
# Names exactly as on https://use-land-property-data.service.gov.uk/datasets/inspire/download (spaces become underscores,
# e.g. Bristol_City_Council); an unknown name loops on a redirect and is reported as failed.
for LA in ${INSPIRE_AREAS:-Warwick_District_Council Bristol_City_Council Birmingham_City_Council Coventry_City_Council Stratford-on-Avon_District_Council Solihull_Metropolitan_Borough_Council Rugby_Borough_Council North_Warwickshire_Borough_Council Nuneaton_and_Bedworth_Borough_Council South_Gloucestershire_Council Bath_and_North_East_Somerset_Council North_Somerset_Council}; do
  get "https://use-land-property-data.service.gov.uk/datasets/inspire/download/${LA}.zip" "inspire_${LA}.zip"
done
# CCOD (UK companies) and OCOD (overseas companies), full monthly files. API key from the data portal.
if [ -n "${HMLR_API_KEY:-}" ]; then
  for DS in ccod ocod; do
    if [ -s "${DS}_full.zip" ]; then log "have ${DS}_full.zip"; continue; fi
    FILE=$(curl -sSL --fail -H "Authorization: $HMLR_API_KEY" "https://use-land-property-data.service.gov.uk/api/v1/datasets/${DS}" \
      | py "import sys,json; d=json.load(sys.stdin); print([r['file_name'] for r in d['result']['resources'] if 'FULL' in r['file_name'].upper()][0])") \
      || { log "FAILED ${DS}: could not list resources (check HMLR_API_KEY and that the ${DS^^} licence is accepted)"; FAILED+=("${DS}_full.zip"); continue; }
    URL=$(curl -sSL --fail -H "Authorization: $HMLR_API_KEY" "https://use-land-property-data.service.gov.uk/api/v1/datasets/${DS}/${FILE}" \
      | py "import sys,json; print(json.load(sys.stdin)['result']['download_url'])") \
      || { log "FAILED ${DS}: no download url for ${FILE}"; FAILED+=("${DS}_full.zip"); continue; }
    get "$URL" "${DS}_full.zip"
  done
else log "HMLR_API_KEY not set: skipping CCOD/OCOD"; fi
# Price paid: current year file and the monthly update (no account).
get "http://prod1.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-$(date +%Y).csv" "pp-$(date +%Y).csv"
get "http://prod1.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv" "pp-monthly-update.csv"

# Regulators -----------------------------------------------------------------------------------
# CQC: the monthly 'HSCA Active Locations' spreadsheet (.ods) linked from the open data page.
CQC_URL=$(curl -sSL --fail -A "$UA" "https://www.cqc.org.uk/about-us/transparency/using-cqc-data" | grep -oE 'https://www\.cqc\.org\.uk/[^"]*HSCA_Active_Locations[^"]*\.(ods|csv|xlsx)' | head -1 || true)
if [ -n "$CQC_URL" ]; then get "$CQC_URL" "cqc_active_locations.${CQC_URL##*.}"; else log "FAILED cqc: no HSCA Active Locations link found"; FAILED+=("cqc"); fi
# Ofsted: 'childcare provider data' CSV from the management information data set (quarterly).
OFSTED_URL=$(curl -sSL --fail -A "$UA" "https://www.gov.uk/api/content/government/statistical-data-sets/childcare-providers-and-inspections-management-information" \
  | py "import sys,json; a=[x for x in json.load(sys.stdin)['details']['attachments'] if x.get('url','').endswith('.csv') and 'provider' in x.get('title','').lower() and 'data as at' in x.get('title','').lower()]; print(a[-1]['url'] if a else '')" 2>/dev/null || true)
if [ -n "$OFSTED_URL" ]; then get "$OFSTED_URL" "ofsted_childcare_providers.csv"; else log "FAILED ofsted: no provider data CSV found on gov.uk"; FAILED+=("ofsted"); fi
# FSA FHRS: one XML per local authority. Ids from https://api.ratings.food.gov.uk/Authorities/basic
# 373 Warwick, 324 Bristol, 374 Birmingham, 375 Coventry, 372 Stratford-on-Avon, 369 North Warwickshire.
for LA in ${FSA_AREAS:-373 324 374 375 372 369}; do get "https://ratings.food.gov.uk/api/open-data-files/FHRS${LA}en-GB.xml" "fhrs_${LA}.xml"; done
# NHSBSA consolidated pharmaceutical list: the newest CSV resource in the CKAN package.
NHS_URL=$(curl -sSL --fail "https://opendata.nhsbsa.net/api/3/action/package_show?id=consolidated-pharmaceutical-list" \
  | py "import sys,json; r=[x for x in json.load(sys.stdin)['result']['resources'] if x.get('url','').lower().endswith('.csv')]; print(r[-1]['url'] if r else '')" 2>/dev/null || true)
if [ -n "$NHS_URL" ]; then get "$NHS_URL" "nhsbsa_pharmacy_list.csv"; else log "FAILED nhsbsa: no CSV resource found"; FAILED+=("nhsbsa"); fi

# VOA, EPC, Companies House, planning ----------------------------------------------------------
# VOA 2026 rating list: compiled list entries baseline plus every change update, direct from the blob store.
VOA_INDEX=$(curl -sSL --fail -A "$UA" "https://voaratinglists.blob.core.windows.net/html/rlidata.htm" || true)
VOA_YEAR=$(echo "$VOA_INDEX" | grep -oE 'ndr-20[0-9]{2}-listentries' | sort -u | tail -1 | grep -oE '20[0-9]{2}' || echo 2026)
VOA_BASE=$(echo "$VOA_INDEX" | grep -oE "https://[^\"' <>]+ndr-${VOA_YEAR}-listentries-compiled-epoch-[0-9]+-baseline-csv\.zip" | sort -u | tail -1 || true)
if [ -n "$VOA_BASE" ]; then
  get "$VOA_BASE" "voa_${VOA_YEAR}_listentries_baseline.zip"
  EPOCH=$(echo "$VOA_BASE" | grep -oE 'epoch-[0-9]+' | head -1)
  for U in $(echo "$VOA_INDEX" | grep -oE "https://[^\"' <>]+ndr-${VOA_YEAR}-listentries-compiled-${EPOCH}-changeupdate-[0-9]+-csv\.zip" | sort -u); do
    N=$(echo "$U" | grep -oE 'changeupdate-[0-9]+' | grep -oE '[0-9]+')
    get "$U" "voa_${VOA_YEAR}_listentries_changeupdate_${N}.zip"
  done
else log "FAILED voa: no ${VOA_YEAR} list entries baseline on rlidata.htm (VOA terms are not OGL: internal analysis only)"; FAILED+=("voa"); fi
# EPC non-domestic certificates: the bulk CSV zip from the new Get Energy Performance Data API
# (https://get-energy-performance-data.communities.gov.uk; bearer token from 'My account' after GOV.UK One Login sign-in).
# EPC_TOKEN=<bearer token>; the old EPC_AUTH=email:key form is accepted and the part after the colon used as the token.
EPC_TOKEN="${EPC_TOKEN:-${EPC_AUTH##*:}}"
if [ -n "$EPC_TOKEN" ]; then
  get "https://api.get-energy-performance-data.communities.gov.uk/api/files/non-domestic/csv" "epc_non_domestic.zip" -H "Authorization: Bearer $EPC_TOKEN" -H "Accept: application/zip"
else log "EPC_TOKEN not set: skipping EPC"; fi
# Companies House basic company data (monthly, one zip).
get "https://download.companieshouse.gov.uk/BasicCompanyDataAsOneFile-${CH_MONTH:-$(date +%Y-%m-01)}.zip" "companies_house_basic.zip"
# planning.data.gov.uk national bulk CSVs (WKT geometry per row). flood-risk-zone is about 2 GB.
PLANNING="conservation-area listed-building article-4-direction-area tree-preservation-zone green-belt brownfield-land scheduled-monument area-of-outstanding-natural-beauty national-park site-of-special-scientific-interest ancient-woodland"
[ -n "${SKIP_FLOOD:-}" ] || PLANNING="$PLANNING flood-risk-zone"
for DS in $PLANNING; do get "https://files.planning.data.gov.uk/dataset/${DS}.csv" "planning_${DS}.csv"; done
# DfT AADF traffic counts (annual zip).
get "https://storage.googleapis.com/dft-statistics/road-traffic/downloads/data-gov-uk/dft_traffic_counts_aadf.zip" "dft_traffic_counts_aadf.zip"

rm -f "$JAR"
log "Done. $(ls -1 | wc -l | tr -d ' ') files, $(du -sh . | cut -f1) in $(pwd)."
if [ ${#FAILED[@]} -gt 0 ]; then log "Failed: ${FAILED[*]} (re-run this script to retry just those)"; exit 1; fi
