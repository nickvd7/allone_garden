#!/usr/bin/env bash
# Align PostgreSQL role "garden" + database with packages/backend/.env (DATABASE_URL).
# Fixes: password authentication failed for user "garden"
#
# Usage: sudo bash scripts/sync-postgres-env.sh [install-dir] [unix-user]
set -euo pipefail

INSTALL_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_OWNER="${2:-$(stat -c '%U' "${INSTALL_DIR}/packages/backend" 2>/dev/null || echo root)}"
ENV_FILE="${INSTALL_DIR}/packages/backend/.env"
POSTGRES_USER="${POSTGRES_USER:-garden}"
POSTGRES_DB="${POSTGRES_DB:-allone_garden}"
PGPORT="${PGPORT:-5432}"

[[ $EUID -eq 0 ]] || { echo "Run met sudo." >&2; exit 1; }
command -v psql &>/dev/null || { echo "PostgreSQL (psql) niet geïnstalleerd." >&2; exit 1; }

if ! su -c "pg_isready -p '${PGPORT}'" postgres &>/dev/null; then
  echo "PostgreSQL draait niet op poort ${PGPORT}. Start: sudo systemctl start postgresql" >&2
  exit 1
fi

# Already works?
if sudo -u "$ENV_OWNER" -H bash -c "cd '${INSTALL_DIR}/packages/backend' && node scripts/check-db-connection.js" 2>/dev/null; then
  echo "[sync-db] DATABASE_URL werkt al."
  exit 0
fi

echo "[sync-db] DATABASE_URL faalt — PostgreSQL-gebruiker '${POSTGRES_USER}' bijwerken…"

DB_PASS="$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)"
DATABASE_URL="postgresql://${POSTGRES_USER}:${DB_PASS}@127.0.0.1:${PGPORT}/${POSTGRES_DB}"

if su -c "psql -p '${PGPORT}' -tc \"SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'\" | grep -q 1" postgres; then
  su -c "psql -p '${PGPORT}' -c \"ALTER USER ${POSTGRES_USER} WITH PASSWORD '${DB_PASS}'\"" postgres
else
  su -c "psql -p '${PGPORT}' -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${DB_PASS}'\"" postgres
fi

su -c "psql -p '${PGPORT}' -tc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\" | grep -q 1" postgres || \
  su -c "psql -p '${PGPORT}' -c \"CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER}\"" postgres

su -c "psql -p '${PGPORT}' -c \"GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER}\"" postgres 2>/dev/null || true

[[ -f "$ENV_FILE" ]] || touch "$ENV_FILE"

if grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "$ENV_FILE"
else
  printf '\nDATABASE_URL=%s\n' "$DATABASE_URL" >> "$ENV_FILE"
fi

chown "${ENV_OWNER}:${ENV_OWNER}" "$ENV_FILE"
chmod 600 "$ENV_FILE"

if ! sudo -u "$ENV_OWNER" -H bash -c "cd '${INSTALL_DIR}/packages/backend' && node scripts/check-db-connection.js"; then
  echo "[sync-db] Verbinding test mislukt na sync." >&2
  exit 1
fi

echo "[sync-db] OK — ${POSTGRES_USER}@${POSTGRES_DB} en .env bijgewerkt."
