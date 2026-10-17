#!/usr/bin/env bash
# Nightly database dump. Cron on the server:  0 2 * * * /opt/Nimb-Cco/scripts/backup-db.sh
#
# What is backed up: everything people create (accounts, alert rules and state, watchlists, pipeline, audit log,
# document orders, CRM records) plus the linked open data. The building footprints table is dumped as schema only:
# it is 13 GB of Overture data that `python -m ingest.run overture_buildings` rebuilds in about 90 minutes.
#
# Retention: KEEP_DAYS (default 3) local dumps, deleted oldest first, and the newest is never deleted. A dump is about
# 14 GB, so 14 days of them would fill the server disk; copy the folder off the server (Hostinger snapshots, rclone
# to object storage, scp) for anything longer.
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP_DAYS="${KEEP_DAYS:-3}"
mkdir -p backups
out="backups/cpi-$(date +%F).dump"
docker compose exec -T db pg_dump -U cpi -d cpi --format=custom --exclude-table-data=buildings > "$out.part"
mv "$out.part" "$out"
ls -1t backups/cpi-*.dump | tail -n +"$((KEEP_DAYS + 1))" | xargs -r rm -f
echo "backup written: $out ($(du -h "$out" | cut -f1)); keeping $(ls -1 backups/cpi-*.dump | wc -l) dump(s)"
