#!/usr/bin/env bash
# Nightly database dump. Add to cron on the server:  0 2 * * * /opt/Nimb-Cco/scripts/backup-db.sh
# Keeps 14 days locally; copy the folder off the server (Hostinger backups, rclone to object storage, or scp) for safety.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
docker compose exec -T db pg_dump -U cpi -d cpi --format=custom > "backups/cpi-$(date +%F).dump"
find backups -name 'cpi-*.dump' -mtime +14 -delete
echo "backup written: backups/cpi-$(date +%F).dump"
