#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — Android / Termux installer
#
# Run AllOne Garden on your Android phone as a local server.
# Other devices on the same Wi-Fi network can connect to it.
#
# Requirements:
#   - Termux (from F-Droid — NOT from Google Play)
#   - At least 1 GB free storage
#   - Android 7+
#
# Usage (inside Termux):
#   bash install-termux.sh
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
error()   { echo -e "\033[0;31m[ERR]${RESET}  $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ENV="${SCRIPT_DIR}/packages/backend/.env"

echo -e "${BOLD}"
echo "  🤖  AllOne Garden — Android / Termux Installer"
echo -e "${RESET}"

# ── Termux packages ───────────────────────────────────────────────────────────
info "Updating Termux packages…"
pkg update -y -q

info "Installing dependencies…"
pkg install -y -q nodejs postgresql redis git openssl

success "Packages installed"
node --version

# ── PostgreSQL setup ──────────────────────────────────────────────────────────
info "Initialising PostgreSQL…"
mkdir -p "$PREFIX/var/lib/postgresql"
initdb "$PREFIX/var/lib/postgresql" -U "$USER" 2>/dev/null || true

# Start postgres in background
pg_ctl -D "$PREFIX/var/lib/postgresql" -l "$PREFIX/var/lib/postgresql/pg.log" start 2>/dev/null || true

# Admin via local socket (peer auth); Node uses TCP in DATABASE_URL below.
PGPORT="${PGPORT:-5432}"
info "Waiting for PostgreSQL (socket / port ${PGPORT})…"
for _ in $(seq 1 30); do
  if command -v pg_isready &>/dev/null && pg_isready -p "$PGPORT" -U "$USER" &>/dev/null; then
    break
  fi
  sleep 1
done
if ! command -v pg_isready &>/dev/null || ! pg_isready -p "$PGPORT" -U "$USER" &>/dev/null; then
  error "PostgreSQL is not ready. Check $PREFIX/var/lib/postgresql/pg.log"
fi

DB_USER="garden"
DB_NAME="allone_garden"
DB_PASS=$(openssl rand -hex 16)

if psql -U "$USER" postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  psql -U "$USER" postgres -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}'"
else
  psql -U "$USER" postgres -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}'"
fi

psql -U "$USER" postgres -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  psql -U "$USER" postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"

success "PostgreSQL ready"

# ── Redis ─────────────────────────────────────────────────────────────────────
redis-server --daemonize yes --logfile "$PREFIX/var/log/redis.log" 2>/dev/null || true
success "Redis started"

# ── npm dependencies ──────────────────────────────────────────────────────────
info "Installing Node.js dependencies…"
cd "$SCRIPT_DIR"
[[ ! -d node_modules ]]                   && npm install --silent
[[ ! -d packages/backend/node_modules ]]  && (cd packages/backend  && npm install --silent)
[[ ! -d packages/frontend/node_modules ]] && (cd packages/frontend && npm install --silent)

info "Building frontend…"
(cd packages/frontend && npm run build)
success "Frontend built"

# ── .env (DATABASE_URL always matches DB_PASS) ───────────────────────────────
DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@127.0.0.1:${PGPORT}/${DB_NAME}"
if [[ ! -f "$BACKEND_ENV" ]]; then
  JWT_SECRET=$(openssl rand -hex 48)

  # Get the phone's Wi-Fi IP so other devices can connect
  WIFI_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "localhost")

  cat > "$BACKEND_ENV" <<EOF
NODE_ENV=production
PORT=5000
FRONTEND_URL=http://${WIFI_IP}:5000
DATABASE_URL=${DATABASE_URL}
REDIS_URL=redis://localhost:6379
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
SERVER_NAME=My Android Garden
P2P_ENABLED=false
EOF
  chmod 600 "$BACKEND_ENV"
  success ".env created (DATABASE_URL + JWT_SECRET)"
else
  if grep -q '^DATABASE_URL=' "$BACKEND_ENV" 2>/dev/null; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "$BACKEND_ENV"
  else
    printf '\nDATABASE_URL=%s\n' "${DATABASE_URL}" >> "$BACKEND_ENV"
  fi
  chmod 600 "$BACKEND_ENV"
  success ".env updated (DATABASE_URL)"
fi

# ── DB schema ─────────────────────────────────────────────────────────────────
info "Running database migrations…"
(cd "${SCRIPT_DIR}/packages/backend" && npm run db:migrate)
success "Database schema ready"

# ── Start script ──────────────────────────────────────────────────────────────
# Create a convenience start script (no systemd in Termux)
cat > "${SCRIPT_DIR}/start-android.sh" <<'STARTEOF'
#!/usr/bin/env bash
# Start AllOne Garden on Android (run inside Termux)
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🌱 Starting AllOne Garden..."

# Start postgres if not running
pg_ctl -D "$PREFIX/var/lib/postgresql" status &>/dev/null || \
  pg_ctl -D "$PREFIX/var/lib/postgresql" -l "$PREFIX/var/log/pg.log" start

# Start redis if not running
redis-cli ping &>/dev/null || \
  redis-server --daemonize yes --logfile "$PREFIX/var/log/redis.log"

# Start backend (migrations are idempotent — safe on every start)
cd "${SCRIPT_DIR}/packages/backend"
source .env 2>/dev/null || true
node scripts/migrate-all.js
node src/index.js
STARTEOF
chmod +x "${SCRIPT_DIR}/start-android.sh"

# ── Serve static frontend ──────────────────────────────────────────────────────
# The backend will serve the built React app if we copy it to /public
mkdir -p "${SCRIPT_DIR}/packages/backend/public"
cp -r "${SCRIPT_DIR}/packages/frontend/build/." "${SCRIPT_DIR}/packages/backend/public/"

# ── Done ──────────────────────────────────────────────────────────────────────
WIFI_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "your-phone-ip")

echo ""
echo -e "${GREEN}${BOLD}✅  AllOne Garden installed!${RESET}"
echo ""
echo "  Start server:  bash start-android.sh"
echo ""
echo "  Game URL (this phone):   http://localhost:5000"
echo "  Game URL (other devices): http://${WIFI_IP}:5000"
echo ""
echo "  ℹ️  Other phones/computers on the same Wi-Fi can join at the URL above."
echo "  ℹ️  Keep Termux open while the server is running."
echo "  ℹ️  Install 'Termux:Boot' from F-Droid to auto-start on reboot."
echo ""
echo "  Starting server now…"
echo ""
bash "${SCRIPT_DIR}/start-android.sh"
