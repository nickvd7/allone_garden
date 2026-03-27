#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — local development starter
# Starts both frontend (React) and backend (Node.js) in parallel.
# No database required — backend runs in in-memory mode.
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

# ── Start ──────────────────────────────────────────────────────────────────────
echo ""
echo "  Frontend → http://localhost:3000"
echo "  Backend  → http://localhost:5000"
echo "  Health   → http://localhost:5000/health"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

# Use concurrently if available (installed as root devDependency), else sequential
if npx concurrently --version &>/dev/null 2>&1; then
  npx concurrently \
    --names "backend,frontend" \
    --prefix-colors "green,cyan" \
    "cd packages/backend && npm run dev" \
    "cd packages/frontend && npm start"
else
  echo "Starting backend in background…"
  (cd packages/backend && npm run dev) &
  BACKEND_PID=$!
  trap "kill $BACKEND_PID 2>/dev/null" EXIT
  echo "Starting frontend…"
  cd packages/frontend && npm start
fi
