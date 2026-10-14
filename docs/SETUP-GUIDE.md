# Setup guide: what to do on your side

Everything below needs either the company network, a credential, or a decision. Each step says what it unlocks and how long it takes. Do them in order; steps 1 to 3 are the ones that turn the demo into the tool.

## Step 1. Run the data load on an office machine (about half a day, mostly waiting)

Why: my environment cannot reach HM Land Registry, CQC, Ofsted, FSA, NHSBSA, VOA, EPC, Companies House or planning.data.gov.uk. Until this runs, titles and operators outside Leamington, Warwick and Bristol are synthetic.

You need: a Windows or Mac laptop on the company network with Python 3.11+ and about 60 GB free disk, and a few accounts that are free but need registering.

1. Register (free) and keep the keys somewhere safe:
   - HM Land Registry: INSPIRE polygons and CCOD/OCOD need a free account at use-land-property-data.service.gov.uk. Accept the CCOD licence (it forbids direct marketing; the platform enforces that).
   - Companies House: a free API key at developer.company-information.service.gov.uk.
   - EPC: a free account at epc.opendatacommunities.org (gives an email and key for bulk download).
   - VOA, CQC, Ofsted, FSA, NHSBSA, planning.data.gov.uk: direct downloads, no account.
2. Clone the repository and install the Python requirements:
   ```
   git clone https://github.com/joshehaines/Nimb-Cco.git
   cd Nimb-Cco/api
   pip install -r requirements.txt
   ```
3. Set the keys in the terminal you will run the script from (they are read as environment variables):
   ```
   export HMLR_API_KEY=...            # from use-land-property-data.service.gov.uk
   export EPC_AUTH=you@christie.com:yourEpcKey
   export CH_MONTH=2026-10-01         # first of the current month, for the Companies House basic file
   ```
4. Run the fetch script and leave it running. It writes everything under `scripts/data/raw/`:
   ```
   bash scripts/data/fetch_sources.sh scripts/data/raw
   ```
   On Windows run it from Git Bash or WSL. Expect two to four hours depending on the connection; INSPIRE is the big one (one zip per local authority; the script lists the authorities to download at the top, add yours).
5. When it finishes, zip `scripts/data/raw/` and either put it on a shared drive I can be pointed at later, or keep it for step 2. Do not email it; it is several gigabytes.

What this unlocks: real titles and owners nationwide, real regulator records, real rateable values and EPCs, real planning, and the Location Analysis rows that currently say "not collected".

## Option: do steps 1 and 2 on a Hostinger VPS instead (recommended)

A virtual server avoids the laptop entirely: fast datacentre downloads, always on, a fixed address, and the firm can take it over later. Hostinger's KVM VPS plans work; pick one with at least 4 vCPU, 16 GB RAM and 200 GB of NVMe disk (the raw downloads alone are about 60 GB), the Ubuntu 24.04 with Docker template, and a London or Amsterdam location. Turn on their automatic backups.

1. In hPanel create the VPS, set a root password or SSH key, and note the IP address. If you have a domain at Hostinger, add an A record such as `pi.yourdomain.com` pointing at that IP.
2. Connect from a Mac or Windows terminal: `ssh root@<ip>`.
3. Paste:
   ```
   apt-get update && apt-get install -y git python3-pip
   git clone https://github.com/joshehaines/Nimb-Cco.git /opt/Nimb-Cco && cd /opt/Nimb-Cco
   cp .env.example .env && nano .env        # set DOMAIN=pi.yourdomain.com, APP_URL=https://pi.yourdomain.com/ and the login lines below; Ctrl-O, Enter, Ctrl-X to save
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   docker compose --profile load run --rm loader
   ```
   After a few minutes https://pi.yourdomain.com (or http://<ip> without a domain) shows the sign-in page, with a certificate issued automatically.
4. Run the step 1 downloads on the server itself (much faster than at home):
   ```
   pip3 install -r api/requirements.txt
   export HMLR_API_KEY=... EPC_AUTH=you@email:key CH_MONTH=2026-10-01
   nohup bash scripts/data/fetch_sources.sh scripts/data/raw > fetch.log 2>&1 &
   ```
   Come back in a few hours; `tail fetch.log` shows progress. Then load with the job loop in step 2 below.
5. Nightly backups: `crontab -e` and add `0 2 * * * /opt/Nimb-Cco/scripts/backup-db.sh`. Hostinger's own VPS backups cover the disk as well.
6. Firewall: in hPanel allow only ports 22, 80 and 443. The database and API are not exposed; everything goes through the HTTPS proxy.

**Logins for colleagues (no IT needed).** Before starting the stack, set these in `.env`:
```
VITE_AUTH=local
LOCAL_AUTH_SECRET=<paste the output of: openssl rand -hex 32>
ADMIN_EMAIL=you@christie.com
ADMIN_PASSWORD=<a strong password for yourself>
```
Then `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`. The sign-in page now asks for email and password; sign in as the admin, open Data sources, and use **Users and sign-in** to create each colleague. You get a temporary password to pass on (by phone, not email); they choose their own at first sign-in. Reset and Disable are on the same card, and every sign-in and account change is in the audit log. Remove `ADMIN_PASSWORD` from `.env` once you have signed in and changed it. Switching to company single sign-on later keeps all the data.

## Step 2. Stand up the backend once (an hour)

Why: the API, PostGIS database and alert worker are written but have never run against a real database, because my environment has no Docker. The first start is the integration test.

You need: a machine with Docker Desktop (the same laptop is fine for a trial; a small server or VM for the pilot).

1. In the repository root:
   ```
   docker compose up -d db api web
   docker compose --profile load run --rm loader
   ```
   The loader creates the schema and loads the open data already in the repository (Warwick, Bristol and the national tiles).
2. Open http://localhost:8080 and sign in with a demo persona. The footer should say the data provider is `http` rather than `mock` once the web build is made with `VITE_DATA_PROVIDER=http` (the compose file does this).
3. To load the step 1 downloads, run each job through the loader (the compose file mounts `scripts/data/raw` as `/raw`):
   ```
   for job in hmlr_inspire hmlr_ccod cqc ofsted fsa nhsbsa voa epc companies_house planning_pdg hmlr_ppd dft_aadf; do
     docker compose --profile load run --rm loader python -m ingest.run $job --workdir /raw
   done
   ```
4. Expect errors on the first run. Copy the terminal output into a message to me and I will fix the loaders; each source is independent, so one failing does not stop the others.

What this unlocks: everything server-side, including alerts actually sending, audit on the server, staff directory from the identity provider, and the Claude assistant.

## Step 3. Credentials for delivery and sign-on (half an hour, plus whoever owns IT)

Copy `.env.example` to `.env` next to `docker-compose.yml` and fill in what you have; every variable has a sensible default so you can add them one at a time, then `docker compose up -d --build`.

| Purpose | Variables | Where to get them |
|---|---|---|
| Alert emails | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | The firm's mail relay (Exchange Online SMTP AUTH or an internal relay). Ask IT for a mailbox such as alerts@christie.com |
| Alert text messages | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `SMS_WEBHOOK_URL` for another gateway) | A Twilio account with a UK number, about £1 a month plus 4p a text |
| Turn real sending on | `ALERTS_DRY_RUN=0` | Leave at 1 until the first two are tested from the Deliveries page |
| Teams | nothing server-side | Each user pastes an Incoming Webhook URL for their channel under Alerts, My channels |
| Assistant | `ANTHROPIC_API_KEY`, optionally `ASSISTANT_MODEL` | console.anthropic.com; build the web app with `VITE_ASSISTANT=claude` |
| Single sign-on | `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID` (web) and `OIDC_ISSUER`, `OIDC_AUDIENCE` (API) | IT registers an app in Microsoft Entra ID with redirect URI = the site address; roles `cpi.compliance` and `cpi.admin` as app roles or groups |
| Staff directory | none; the `staff` table | IT exports the Entra group (name, email, mobile, office, team) as CSV once; a sync job can follow |
| Ordnance Survey basemaps | `VITE_OS_API_KEY`, or each user pastes a key under Settings | osdatahub.os.uk, free tier |

## Step 4. A sample CRM export (ten minutes)

Export 50 or so accounts, contacts and sites from the CRM as CSV with the real column headers, remove anything sensitive, and share it. I will map the CRM export presets to your exact column names and test the de-duplication against it. Tell me which CRM it is.

## Step 5. Decisions (a conversation)

1. **Hosting**: internal server behind single sign-on, or a private cloud project. Either works with the compose file; the public GitHub Pages copy should be retired once staff are on the internal one, and the repository made private again.
2. **Pilot scope**: one office and two sectors for four weeks, per the business case (docs/BUSINESS-CASE.md).
3. **Footfall vendor**: whether to trial one; the layer and catchment page are ready for a feed.
4. **Scotland**: whether to open the Registers of Scotland licence conversation now (docs/SCOTLAND.md).
5. **Nimbus renewal date**, so the overlap is one cycle.

## Step 6. Nationwide building snapping (overnight, after step 1)

Real-business dots outside the demo areas sit on the road until the building footprints are downloaded for the whole country. On the office machine:
```
python scripts/data/snap_places_national.py --all
```
It streams Overture buildings cell by cell from S3 (tens of gigabytes over a night), moves every dot onto its footprint and rewrites the tiles. Commit the changed tiles or copy them to the server. In PostGIS the loader does the same with `snap_places_to_buildings()` once buildings are loaded.

## What to send back

- Terminal output from steps 1 and 2 (even if it looks fine).
- Which variables from step 3 are set.
- The CRM sample and its name.
- Answers to the five decisions.

With those I can finish the loaders against real data, wire the CRM presets, and prepare the pilot build.
