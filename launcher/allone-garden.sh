#!/usr/bin/env bash
# AllOne Garden Launcher — Linux / Raspberry Pi
# https://github.com/nickvd7/allone_garden
#
# Usage: bash allone-garden.sh
# Requires: git, Node.js 20+, npm

set -euo pipefail

REPO_URL='https://github.com/nickvd7/allone_garden.git'
INSTALL_DIR="$HOME/.local/share/allone-garden"
CONFIG_DIR="$HOME/.config/allone-garden"
CONFIG_FILE="$CONFIG_DIR/config.json"
MIN_NODE=20

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

banner() {
  clear
  printf '\n'
  printf '  ╔══════════════════════════════════════════════╗\n'
  printf '  ║   🌱  AllOne Garden — Launcher               ║\n'
  printf '  ║   Open-source multiplayer gardening game     ║\n'
  printf '  ╚══════════════════════════════════════════════╝\n'
  printf '\n'
}

check_prereqs() {
  local ok=1
  printf "  ${BOLD}Checking requirements...${RESET}\n"

  if ! command -v git &>/dev/null; then
    printf "  ${RED}✗ git not found — install with: sudo apt install git${RESET}\n"
    ok=0
  else
    printf "  ${GREEN}✓ git$(git --version | awk '{print " " $3}')${RESET}\n"
  fi

  if ! command -v node &>/dev/null; then
    printf "  ${RED}✗ Node.js not found — install v${MIN_NODE}+ from https://nodejs.org${RESET}\n"
    ok=0
  else
    local ver
    ver=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "$ver" -lt "$MIN_NODE" ]; then
      printf "  ${RED}✗ Node.js v$ver found — need v${MIN_NODE}+${RESET}\n"
      ok=0
    else
      printf "  ${GREEN}✓ Node.js $(node --version)${RESET}\n"
    fi
  fi

  if ! command -v npm &>/dev/null; then
    printf "  ${RED}✗ npm not found (should be bundled with Node.js)${RESET}\n"
    ok=0
  fi

  if [ "$ok" -eq 0 ]; then
    printf '\n  Install missing tools and re-run this script.\n\n'
    exit 1
  fi
  printf '\n'
}

sync_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    printf "  ${CYAN}🔄 Updating game files...${RESET}\n"
    git -C "$INSTALL_DIR" pull --ff-only origin main 2>/dev/null || true
  else
    printf "  ${CYAN}📥 Downloading AllOne Garden...${RESET}\n"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  fi

  printf "  ${CYAN}📦 Installing dependencies...${RESET}\n"
  npm --prefix "$INSTALL_DIR" install --silent --ignore-scripts 2>/dev/null
  printf "  ${GREEN}✓ Ready${RESET}\n\n"
}

# Read or create persistent config (JWT secret stays stable across restarts so
# sessions survive server restarts without forced logout).
load_config() {
  mkdir -p "$CONFIG_DIR"
  chmod 700 "$CONFIG_DIR"

  if [ ! -f "$CONFIG_FILE" ]; then
    local secret
    secret=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")
    node - "$CONFIG_FILE" "$secret" <<'JSEOF'
const [,, file, secret] = process.argv;
const fs = require('fs');
fs.writeFileSync(file, JSON.stringify({ jwtSecret: secret, serverName: 'My Garden', port: 5000 }, null, 2), { mode: 0o600 });
JSEOF
  fi
  chmod 600 "$CONFIG_FILE"

  JWT_SECRET=$(node -e "process.stdout.write(require('$CONFIG_FILE').jwtSecret||'')")
  SERVER_NAME=$(node -e "process.stdout.write(require('$CONFIG_FILE').serverName||'My Garden')")
  PORT=$(node -e "process.stdout.write(String(require('$CONFIG_FILE').port||5000))")

  # Re-generate if missing or too short
  if [ "${#JWT_SECRET}" -lt 32 ]; then
    JWT_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")
    node - "$CONFIG_FILE" "$JWT_SECRET" <<'JSEOF'
const [,, file, secret] = process.argv;
const fs = require('fs');
const c = JSON.parse(fs.readFileSync(file, 'utf8'));
c.jwtSecret = secret;
fs.writeFileSync(file, JSON.stringify(c, null, 2), { mode: 0o600 });
JSEOF
  fi
}

save_server_name() {
  # Passes name as argv to avoid shell injection
  node - "$CONFIG_FILE" "$1" <<'JSEOF'
const [,, file, name] = process.argv;
const fs = require('fs');
const c = JSON.parse(fs.readFileSync(file, 'utf8'));
c.serverName = name;
fs.writeFileSync(file, JSON.stringify(c, null, 2), { mode: 0o600 });
JSEOF
}

get_lan_ip() {
  local ip=""
  if command -v ip &>/dev/null; then
    ip=$(ip route get 8.8.8.8 2>/dev/null | awk '/src/{print $7; exit}') || true
  fi
  if [ -z "$ip" ] && command -v hostname &>/dev/null; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  fi
  echo "${ip:-127.0.0.1}"
}

open_browser() {
  local url="$1"
  if command -v xdg-open &>/dev/null; then
    xdg-open "$url" 2>/dev/null &
  elif command -v sensible-browser &>/dev/null; then
    sensible-browser "$url" 2>/dev/null &
  else
    printf "\n  ${YELLOW}Open this URL in your browser:${RESET}\n  $url\n"
  fi
}

wait_for_backend() {
  local port="$1" ready=0
  for _ in $(seq 1 40); do
    sleep 0.5
    if curl -sf "http://localhost:$port/health" &>/dev/null; then
      ready=1; break
    fi
  done
  echo "$ready"
}

mode_local() {
  printf '\n'
  printf "  ${GREEN}🏠 Starting locally — solo or LAN play${RESET}\n"
  printf "  ${BOLD}(Server is only reachable from this device)${RESET}\n\n"

  load_config
  local db_path="$CONFIG_DIR/garden.db"

  export NODE_ENV=production
  export PORT="$PORT"
  export FRONTEND_URL="http://localhost:$PORT"
  export JWT_SECRET="$JWT_SECRET"
  export SQLITE_PATH="$db_path"
  export ELECTRON_MODE=1
  export SERVER_NAME="$SERVER_NAME"

  node "$INSTALL_DIR/packages/backend/src/index.js" &
  local pid=$!

  if [ "$(wait_for_backend "$PORT")" = "1" ]; then
    printf "  ${GREEN}✅ Server running at http://localhost:$PORT${RESET}\n"
    open_browser "http://localhost:$PORT"
    printf '\n'
    printf "  ${YELLOW}Press Ctrl+C to stop the server${RESET}\n"
    wait "$pid"
  else
    printf "  ${RED}✗ Server failed to start.${RESET}\n"
    kill "$pid" 2>/dev/null || true
    exit 1
  fi
}

mode_online() {
  printf '\n'
  printf "  ${CYAN}🌐 Connect to an existing server${RESET}\n\n"
  printf "  Server URL (e.g. https://garden.example.com): "
  read -r url
  url="${url// /}"

  # Only allow http:// and https:// — prevents passing file://, javascript:, etc.
  if [[ ! "$url" =~ ^https?://[a-zA-Z0-9] ]]; then
    printf "  ${RED}✗ Invalid URL. Must start with http:// or https://${RESET}\n"
    read -rp "  Press Enter to return to menu... "
    return
  fi

  printf "  ${GREEN}🚀 Opening browser...${RESET}\n"
  open_browser "$url"
  read -rp "  Press Enter to exit... "
}

mode_host() {
  printf '\n'
  printf "  ${CYAN}🖥️  Host a server — others can connect${RESET}\n\n"

  load_config
  local lan_ip
  lan_ip=$(get_lan_ip)

  printf "  Server name [${SERVER_NAME}]: "
  read -r new_name
  if [ -n "$new_name" ]; then
    SERVER_NAME="$new_name"
    save_server_name "$SERVER_NAME"
  fi

  local db_path="$CONFIG_DIR/garden.db"

  printf '\n'
  printf "  ─────────────────────────────────────────────\n"
  printf "  Server : %s\n" "$SERVER_NAME"
  printf "  Port   : %s\n" "$PORT"
  printf "  LAN    : ${CYAN}http://${lan_ip}:${PORT}${RESET}\n"
  printf "  WAN    : http://YOUR-PUBLIC-IP:%s  (+ port forwarding)\n" "$PORT"
  printf "  ─────────────────────────────────────────────\n\n"
  printf "  ${YELLOW}⚠️  For public internet access, use HTTPS via a reverse proxy.${RESET}\n"
  printf "  ${YELLOW}   See: SECURITY_HARDENING.md${RESET}\n\n"

  export NODE_ENV=production
  export PORT="$PORT"
  export FRONTEND_URL="http://${lan_ip}:${PORT}"
  export JWT_SECRET="$JWT_SECRET"
  export SQLITE_PATH="$db_path"
  export ELECTRON_MODE=1
  export SERVER_NAME="$SERVER_NAME"

  printf "  ${GREEN}🌱 Starting '$SERVER_NAME' — Ctrl+C to stop${RESET}\n\n"
  node "$INSTALL_DIR/packages/backend/src/index.js"
}

# ── Main ──────────────────────────────────────────────────────────────────────
banner
check_prereqs
sync_repo
banner

printf "  ${BOLD}How do you want to play?${RESET}\n\n"
printf "  ${CYAN}[1]  🏠  Play locally   — solo or LAN, no internet required${RESET}\n"
printf "  ${CYAN}[2]  🌐  Play online    — join an existing server${RESET}\n"
printf "  ${CYAN}[3]  🖥️   Host a server  — let others join from LAN or internet${RESET}\n"
printf "  ${CYAN}[q]  Exit${RESET}\n\n"
printf "  Choice [1/2/3/q]: "
read -r choice

case "$choice" in
  1) mode_local  ;;
  2) mode_online ;;
  3) mode_host   ;;
  q|Q) exit 0   ;;
  *) printf "  ${RED}Invalid choice.${RESET}\n"; sleep 2 ;;
esac
