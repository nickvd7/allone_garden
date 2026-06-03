#!/usr/bin/env bash
# Deploy van werk-copy → productie-map (geen git clone op /opt).
#
# Architectuur Pi:
#   ~/coding/allone_garden  = git working copy (git pull / git-pull.sh)
#   /opt/allone-garden      = productie (rsync, geen .git nodig)
#
# Behoudt in productie: packages/backend/.env, node_modules, frontend/build.
# Usage:
#   sudo bash scripts/deploy-to-production.sh
# Optioneel: SOURCE_DIR=... PRODUCTION_DIR=/opt/allone-garden PRODUCTION_USER=garden
#            DEPLOY_GIT_PULL=0  (sla git-pull over)
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
die()     { echo -e "${RED}[ERR]${RESET}  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run met sudo"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
PRODUCTION_DIR="${PRODUCTION_DIR:-/opt/allone-garden}"
PRODUCTION_USER="${PRODUCTION_USER:-garden}"
GIT_USER="${SUDO_USER:-$(stat -c '%U' "$SOURCE_DIR" 2>/dev/null || echo "$PRODUCTION_USER")}"

[[ -f "${SOURCE_DIR}/install.sh" ]] || die "Geen install.sh in SOURCE_DIR=${SOURCE_DIR}"

echo -e "${BOLD}Deploy: ${SOURCE_DIR} → ${PRODUCTION_DIR}${RESET}"

if [[ "${DEPLOY_GIT_PULL:-1}" == 1 && -x "${SOURCE_DIR}/scripts/git-pull.sh" ]]; then
  info "Bron bijwerken (git-pull.sh)…"
  bash "${SOURCE_DIR}/scripts/git-pull.sh" "$SOURCE_DIR" "$GIT_USER" \
    || warn "git-pull mislukt — gebruik huidige bron op schijf (auth: bash scripts/setup-git-auth.sh)"
fi

mkdir -p "$PRODUCTION_DIR"

# Rsync in-place met --delete, maar BEHOUD productie-specifieke bestanden:
#   .env (DB-wachtwoord/JWT), node_modules en build (worden door update.sh ververst).
info "Rsync bron → productie (behoud .env, node_modules, build)…"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'packages/backend/node_modules' \
  --exclude 'packages/frontend/node_modules' \
  --exclude 'packages/frontend/build' \
  --exclude 'packages/backend/.env' \
  "${SOURCE_DIR}/" "${PRODUCTION_DIR}/"

chown -R "${PRODUCTION_USER}:${PRODUCTION_USER}" "$PRODUCTION_DIR"
success "Code in ${PRODUCTION_DIR}"
