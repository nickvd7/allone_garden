#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — macOS installer
#
# Installs Node.js, PostgreSQL, and Redis via Homebrew, then starts the game
# as a local development server managed by pm2.
#
# Usage:
#   bash install-mac.sh
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
echo "  🍎  AllOne Garden — macOS Installer"
echo -e "${RESET}"

# ── Homebrew ──────────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  info "Installing Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  success "Homebrew found"
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || \
   [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')" -lt 18 ]]; then
  info "Installing Node.js 20…"
  brew install node@20
  brew link --force --overwrite node@20
fi
success "Node.js $(node --version)"

# ── PostgreSQL ────────────────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  info "Installing PostgreSQL 16…"
  brew install postgresql@16
  brew services start postgresql@16
  # Give postgres a moment to start
  sleep 2
else
  brew services start postgresql@16 2>/dev/null || true
fi
success "PostgreSQL ready"

# ── Redis ─────────────────────────────────────────────────────────────────────
if ! command -v redis-cli &>/dev/null; then
  info "Installing Redis…"
  brew install redis
fi
brew services start redis 2>/dev/null || true
success "Redis ready"

# ── pm2 (process manager) ─────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing pm2…"
  npm install -g pm2
fi
success "pm2 ready"

# ── npm dependencies ──────────────────────────────────────────────────────────
info "Installing dependencies…"
cd "$SCRIPT_DIR"
[[ ! -d node_modules ]]                     && npm install --silent
[[ ! -d packages/backend/node_modules ]]    && (cd packages/backend  && npm install --silent)
[[ ! -d packages/frontend/node_modules ]]   && (cd packages/frontend && npm install --silent)

info "Building frontend…"
(cd packages/frontend && npm run build)
success "Frontend built"

# ── Create DB + user ──────────────────────────────────────────────────────────
DB_USER="garden"
DB_NAME="allone_garden"
DB_PASS=$(openssl rand -hex 16)

psql postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  psql postgres -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}'"

psql postgres -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  psql postgres -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"

success "Database '${DB_NAME}' ready"

# ── .env ──────────────────────────────────────────────────────────────────────
if [[ ! -f "$BACKEND_ENV" ]]; then
  JWT_SECRET=$(openssl rand -hex 48)
  cat > "$BACKEND_ENV" <<EOF
NODE_ENV=production
PORT=5000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
REDIS_URL=redis://localhost:6379
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
SERVER_NAME=My Mac Garden
P2P_ENABLED=false
EOF
  chmod 600 "$BACKEND_ENV"
  success ".env created"
else
  warn ".env already exists — skipping"
fi

# ── DB schema ─────────────────────────────────────────────────────────────────
info "Running database setup…"
node "${SCRIPT_DIR}/packages/backend/scripts/setup-db.js"
success "Database schema ready"

# ── Start with pm2 ────────────────────────────────────────────────────────────
info "Starting AllOne Garden with pm2…"
cd "$SCRIPT_DIR/packages/backend"
pm2 delete allone-garden 2>/dev/null || true
pm2 start src/index.js --name allone-garden --env production
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || warn "Run 'pm2 startup' manually to enable auto-start on login"

echo ""
echo -e "${GREEN}${BOLD}✅  AllOne Garden is running!${RESET}"
echo ""
echo "  Game URL:  http://localhost:5000  (or open packages/frontend/build in a browser)"
echo "  Logs:      pm2 logs allone-garden"
echo "  Stop:      pm2 stop allone-garden"
echo "  Restart:   pm2 restart allone-garden"
echo ""
echo "  Tip: set FRONTEND_URL in packages/backend/.env to your local IP"
echo "  so other devices on your network can join."
echo ""
