#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — local development starter
# Starts both frontend (React) and backend (Node.js) in parallel.
# Uses packages/backend/.env (created from .env.example on first run).
# Leave DATABASE_URL empty there for in-memory mode, or set it to use PostgreSQL.
# =============================================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

echo -e "${GREEN}"
echo "  🌱  AllOne Garden — Development Mode"
echo -e "${RESET}"

# ── Node.js check ──────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌  Node.js not found. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -e 'process.stdout.write(process.version.slice(1).split(".")[0])')
if [[ "$NODE_VER" -lt 18 ]]; then
  echo "❌  Node.js 18 or higher required (found v${NODE_VER})"
  exit 1
fi

# ── Install dependencies (first run or when package.json changes) ──────────────
install_if_needed() {
  local dir=$1
  if [[ ! -d "${dir}/node_modules" ]]; then
    echo -e "${YELLOW}[setup]${RESET} Installing dependencies in ${dir}…"
    (cd "$dir" && npm install --silent)
  fi
}

install_if_needed "."
install_if_needed "packages/backend"
install_if_needed "packages/frontend"

# ── Backend .env ───────────────────────────────────────────────────────────────
if [[ ! -f "packages/backend/.env" ]]; then
  echo -e "${YELLOW}[setup]${RESET} Creating .env from example…"
  cp packages/backend/.env.example packages/backend/.env
  echo "  ⚠️  Review packages/backend/.env before production use."
fi

# ── Ports (optional env: BACKEND_PORT, FRONTEND_PORT) ─────────────────────────
# If unset, picks the first free port from 5000 / 3000 upward (macOS AirPlay often uses 5000).
port_in_use() {
  local p="$1"
  if command -v lsof &>/dev/null; then
    lsof -iTCP:"$p" -sTCP:LISTEN -P -n &>/dev/null
    return $?
  fi
  # Bash /dev/tcp fallback
  (echo >/dev/tcp/127.0.0.1/"$p") &>/dev/null
}

pick_free_port() {
  local start="$1"
  local max_attempts="${2:-60}"
  local p="$start"
  local i=0
  while [[ $i -lt $max_attempts ]]; do
    if ! port_in_use "$p"; then
      echo "$p"
      return 0
    fi
    p=$((p + 1))
    i=$((i + 1))
  done
  return 1
}

if [[ -n "${BACKEND_PORT:-}" ]]; then
  if port_in_use "$BACKEND_PORT"; then
    echo -e "${YELLOW}❌${RESET} BACKEND_PORT=$BACKEND_PORT is already in use. Stop the other process or choose a free port."
    exit 1
  fi
else
  BACKEND_PORT="$(pick_free_port 5000)" || { echo -e "${YELLOW}❌${RESET} No free TCP port found for backend (tried 5000–5059)."; exit 1; }
  if [[ "$BACKEND_PORT" != "5000" ]]; then
    echo -e "${YELLOW}[start]${RESET} Port 5000 busy — backend using ${BACKEND_PORT}"
  fi
fi

if [[ -n "${FRONTEND_PORT:-}" ]]; then
  if port_in_use "$FRONTEND_PORT"; then
    echo -e "${YELLOW}❌${RESET} FRONTEND_PORT=$FRONTEND_PORT is already in use. Stop the other process or choose a free port."
    exit 1
  fi
else
  FRONTEND_PORT="$(pick_free_port 3000)" || { echo -e "${YELLOW}❌${RESET} No free TCP port found for frontend (tried 3000–3059)."; exit 1; }
  if [[ "$FRONTEND_PORT" != "3000" ]]; then
    echo -e "${YELLOW}[start]${RESET} Port 3000 busy — frontend using ${FRONTEND_PORT}"
  fi
fi

export BACKEND_PORT FRONTEND_PORT
BACKEND_URL="http://localhost:${BACKEND_PORT}"
FRONTEND_URL_RUN="http://localhost:${FRONTEND_PORT}"

# ── Start ──────────────────────────────────────────────────────────────────────
echo ""
echo "  Frontend → ${FRONTEND_URL_RUN}"
echo "  Backend  → ${BACKEND_URL}"
echo "  Health   → ${BACKEND_URL}/health"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

# PORT / FRONTEND_URL override .env so picked free ports win over defaults in .env.
BACKEND_CMD="cd packages/backend && PORT=${BACKEND_PORT} FRONTEND_URL=${FRONTEND_URL_RUN} npm run dev"
FRONTEND_CMD="cd packages/frontend && PORT=${FRONTEND_PORT} REACT_APP_API_URL=${BACKEND_URL} npm start"

# Use concurrently if available (installed as root devDependency), else sequential
if npx concurrently --version &>/dev/null 2>&1; then
  npx concurrently \
    --names "backend,frontend" \
    --prefix-colors "green,cyan" \
    "$BACKEND_CMD" \
    "$FRONTEND_CMD"
else
  echo "Starting backend in background…"
  ( cd packages/backend && PORT="$BACKEND_PORT" FRONTEND_URL="$FRONTEND_URL_RUN" npm run dev ) &
  BACKEND_PID=$!
  trap "kill $BACKEND_PID 2>/dev/null" EXIT
  echo "Starting frontend…"
  cd packages/frontend && PORT="$FRONTEND_PORT" REACT_APP_API_URL="$BACKEND_URL" npm start
fi
