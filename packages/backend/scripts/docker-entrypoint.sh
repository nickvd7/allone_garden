#!/bin/sh
set -e
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] Running database migrations…"
  node scripts/migrate-all.js
fi
exec "$@"
