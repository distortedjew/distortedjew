#!/bin/sh
# Runs inside the "backup" service: a compressed pg_dump every
# BACKUP_INTERVAL_HOURS, keeping BACKUP_KEEP_DAYS days of dumps in ./backups.
set -eu
: "${BACKUP_INTERVAL_HOURS:=24}"
: "${BACKUP_KEEP_DAYS:=14}"

while true; do
  file="/backups/wisp-$(date -u +%Y%m%d-%H%M%S).sql.gz"
  if pg_dump -h postgres -U wisp -d wisp --no-owner | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "[backup] wrote $file"
  else
    rm -f "$file.tmp"
    echo "[backup] FAILED" >&2
  fi
  find /backups -name 'wisp-*.sql.gz' -mtime +"$BACKUP_KEEP_DAYS" -delete
  sleep $((BACKUP_INTERVAL_HOURS * 3600))
done
