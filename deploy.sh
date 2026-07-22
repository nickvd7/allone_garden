#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — één-commando deploy op de Raspberry Pi
#
#   cd ~/coding/allone_garden
#   sudo bash deploy.sh
#
# Met automatische rollback bij mislukte health-check:
#   sudo bash scripts/deploy-with-rollback.sh
#
# Doet achter elkaar:
#   1. git pull in je clone (~/coding) — zonder wachtwoord na setup-git-auth.sh
#   2. rsync clone → /opt/allone-garden (behoudt .env / node_modules / build)
#   3. update.sh op /opt: npm install, frontend build (SW cache-bust),
#      DB-migraties, herstart allone-garden + nginx, en SSL (TransIP DNS-01)
#
# Variabelen (optioneel):
#   GARDEN_DEPLOY_DIR=/opt/allone-garden
#   GARDEN_USER=garden
# =============================================================================
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'
info() { echo -e "${CYAN}[deploy]${RESET} $*"; }
die()  { echo -e "${RED}[deploy]${RESET} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run met sudo: sudo bash deploy.sh"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROD="${GARDEN_DEPLOY_DIR:-/opt/allone-garden}"

[[ -x "${ROOT}/scripts/deploy-to-production.sh" ]] || die "Ontbreekt scripts/deploy-to-production.sh — eerst: git pull"

echo -e "${BOLD}🌱 AllOne Garden — deploy${RESET}"

# 1 + 2: git pull + rsync naar /opt
PRODUCTION_DIR="$PROD" PRODUCTION_USER="${GARDEN_USER:-garden}" \
  bash "${ROOT}/scripts/deploy-to-production.sh"

# 3: build/migraties/herstart/SSL op /opt
[[ -f "${PROD}/update.sh" ]] || die "Geen update.sh in ${PROD}"
info "Productie bijwerken (${PROD})…"
GARDEN_DIR="$PROD" bash "${PROD}/update.sh"

echo ""
echo -e "${GREEN}${BOLD}✅  Deploy klaar${RESET} → ${PROD}"
echo -e "  Test:  curl -sS https://allone.garden/api/health"
echo -e "  Of:    curl -sS http://127.0.0.1/api/health"
