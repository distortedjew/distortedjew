#!/bin/sh
# Container start: apply pending database migrations, (re)seed the static
# catalogs (games, achievements — the seed is idempotent), then start the app.
set -e

echo "[wisp] applying database migrations"
node_modules/.bin/prisma migrate deploy

echo "[wisp] seeding catalogs"
node_modules/.bin/tsx prisma/seed.ts

echo "[wisp] starting server"
exec node_modules/.bin/tsx server/index.ts
