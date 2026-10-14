#!/usr/bin/env bash
# Download every bulk source the platform ingests, from a machine with ordinary internet access,
# then load them with the parsers in api/ingest. Free accounts are needed where marked.
#
#   export HMLR_API_KEY=...        # use-land-property-data.service.gov.uk  (free; CCOD/OCOD licence accepted online)
#   export EPC_AUTH=email:apikey   # epc.opendatacommunities.org            (free registration)
#   export CH_MONTH=2026-10-01     # Companies House basic data file date (first of the month)
#   ./fetch_sources.sh raw/
#
# Afterwards:  cd api && for job in hmlr_inspire hmlr_ccod cqc ofsted fsa nhsbsa voa epc companies_house planning_pdg hmlr_ppd dft_aadf; do
#                python -m ingest.run $job --workdir ../scripts/data/raw; done
set -euo pipefail
OUT="${1:-raw}"; mkdir -p "$OUT"; cd "$OUT"
get() { echo "-> $2"; curl -sSL --fail --retry 3 -o "$2" "$1"; }

# HM Land Registry -----------------------------------------------------------------------------
# INSPIRE index polygons: one zip per local authority (no account). Add the authorities you cover.
for LA in Warwick Bristol_City Birmingham Coventry Stratford-on-Avon; do
  get "https://use-land-property-data.service.gov.uk/datasets/inspire/download/${LA}.zip" "inspire_${LA}.zip"
done
# CCOD (UK companies) and OCOD (overseas companies), full monthly files. API key from the data portal.
if [ -n "${HMLR_API_KEY:-}" ]; then
  for DS in ccod ocod; do
    curl -sSL --fail -H "Authorization: $HMLR_API_KEY" "https://use-land-property-data.service.gov.uk/api/v1/datasets/${DS}" | python3 -c "import sys,json; d=json.load(sys.stdin); print([r['file_name'] for r in d['result']['resources'] if 'FULL' in r['file_name'].upper()][0])" > "${DS}_latest.txt"
    curl -sSL --fail -H "Authorization: $HMLR_API_KEY" "https://use-land-property-data.service.gov.uk/api/v1/datasets/${DS}/$(cat ${DS}_latest.txt)" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['download_url'])" > "${DS}_url.txt"
    get "$(cat ${DS}_url.txt)" "${DS}_full.zip"
  done
else echo "HMLR_API_KEY not set: skipping CCOD/OCOD"; fi
# Price paid: current year file and the monthly update (no account).
get "http://prod1.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-$(date +%Y).csv" "pp-$(date +%Y).csv"
get "http://prod1.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-monthly-update-new-version.csv" "pp-monthly-update.csv"

# Regulators -----------------------------------------------------------------------------------
get "https://www.cqc.org.uk/sites/default/files/HSCA_Active_Locations.csv" "cqc_locations.csv" || echo "CQC: check the current file name at https://www.cqc.org.uk/about-us/transparency/using-cqc-data"
get "https://www.gov.uk/government/statistics/childcare-providers-and-inspections" "ofsted_index.html"   # pick the latest 'registered providers' CSV link from this page
# FSA FHRS: one XML per local authority. 423 = Warwick, 429 = Bristol; full list: https://ratings.food.gov.uk/open-data
for LA in 423 429; do get "https://ratings.food.gov.uk/api/open-data-files/FHRS${LA}en-GB.xml" "fhrs_${LA}.xml"; done
get "https://opendata.nhsbsa.net/api/3/action/package_show?id=consolidated-pharmaceutical-list" "nhsbsa_package.json"   # take the latest resource URL from this JSON

# VOA, EPC, Companies House, planning ----------------------------------------------------------
echo "VOA: download the compiled list entries and summary valuations from https://voaratinglists.blob.core.windows.net/html/rlidata.htm (browser; accept the terms)"
if [ -n "${EPC_AUTH:-}" ]; then
  curl -sSL --fail -u "$EPC_AUTH" -H "Accept: application/zip" -o epc_non_domestic.zip "https://epc.opendatacommunities.org/api/v1/files/all-non-domestic-certificates.zip"
else echo "EPC_AUTH not set: skipping EPC"; fi
get "https://download.companieshouse.gov.uk/BasicCompanyDataAsOneFile-${CH_MONTH:-$(date +%Y-%m-01)}.zip" "companies_house_basic.zip"
for DS in conservation-area listed-building article-4-direction-area tree-preservation-zone; do
  get "https://www.planning.data.gov.uk/entity.json?dataset=${DS}&limit=500&geometry_relation=intersects&longitude=-1.54&latitude=52.29" "planning_${DS}.json"
done
get "https://storage.googleapis.com/dft-statistics/road-traffic/downloads/data-gov-uk/dft_traffic_counts_aadf.zip" "dft_traffic_counts_aadf.zip"
echo "Done. Unzip the archives, then run the ingest jobs listed at the top of this file."
