#!/bin/sh
# Restore the database from a backup made by the "backup" service.
#
#   ./deploy/restore.sh backups/wisp-20260101-030000.sql.gz
#
# This REPLACES the current database. The app is stopped during the restore.
set -eu

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "usage: $0 backups/wisp-<timestamp>.sql.gz" >&2
  exit 1
fi

compose="docker compose -f docker-compose.prod.yml"

printf 'This replaces the current database with %s. Type "restore" to continue: ' "$file"
read -r answer
[ "$answer" = "restore" ] || { echo "aborted"; exit 1; }

$compose stop app
$compose exec -T postgres psql -U wisp -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS wisp WITH (FORCE);" -c "CREATE DATABASE wisp OWNER wisp;"
gunzip -c "$file" | $compose exec -T postgres psql -U wisp -d wisp -v ON_ERROR_STOP=1 -q
$compose start app
echo "restored $file"
