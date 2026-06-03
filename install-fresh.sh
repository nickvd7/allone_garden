#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — schone (her)installatie op Raspberry Pi / Debian
#
# Doet alles in één keer:
#   • stopt de oude service
#   • verse clone naar /opt/allone-garden (oude map → .bak.<datum>)
#   • install.sh: Node, Postgres, Redis, nginx, .env, build, migraties, systemd
#
# Gebruik (aanbevolen — productie op de Pi):
#   curl -fsSL https://raw.githubusercontent.com/nickvd7/allone_garden/main/install-fresh.sh | sudo bash
#
# Of vanuit een bestaande clone:
#   sudo bash install-fresh.sh
#
# Optioneel:
#   GARDEN_DIR=/opt/allone-garden     (standaard)
#   GARDEN_USER=garden                (standaard)
#   FRESH_CLONE=0                     behoud bestaande map, alleen .env + install opnieuw
#   GARDEN_EMAIL=you@example.com      Let's Encrypt mail
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
die()     { echo -e "${RED}[ERR]${RESET}  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run met sudo: sudo bash install-fresh.sh"

INSTALL_DIR="${GARDEN_DIR:-/opt/allone-garden}"
SERVICE_USER="${GARDEN_USER:-garden}"
FRESH_CLONE="${FRESH_CLONE:-1}"
REPO_URL="https://github.com/nickvd7/allone_garden.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || SCRIPT_DIR=""

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  🌱  AllOne Garden — schone installatie      ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${RESET}"
info "Doelmap:      ${INSTALL_DIR}"
info "Service-user: ${SERVICE_USER}"
info "Fresh clone:  ${FRESH_CLONE}"

if systemctl is-active --quiet allone-garden 2>/dev/null; then
  info "Stoppen allone-garden…"
  systemctl stop allone-garden
fi

if [[ "$FRESH_CLONE" == 1 ]]; then
  if [[ -d "$INSTALL_DIR" ]]; then
    BACKUP="${INSTALL_DIR}.bak.$(date +%Y%m%d%H%M%S)"
    info "Backup bestaande installatie → ${BACKUP}"
    mv "$INSTALL_DIR" "$BACKUP"
  fi
  info "Clonen van ${REPO_URL}…"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  env -u GIT_ASKPASS -u SSH_ASKPASS GIT_TERMINAL_PROMPT=0 \
    git -c credential.helper= -c core.askPass= \
    clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
  success "Broncode in ${INSTALL_DIR}"
  INSTALL_SCRIPT="${INSTALL_DIR}/install.sh"
elif [[ -n "$SCRIPT_DIR" && -f "${SCRIPT_DIR}/install.sh" ]]; then
  INSTALL_SCRIPT="${SCRIPT_DIR}/install.sh"
  export GARDEN_DIR="${GARDEN_DIR:-$SCRIPT_DIR}"
  INSTALL_DIR="$GARDEN_DIR"
  info "Hergebruik repo in ${INSTALL_DIR} (FRESH_CLONE=0)"
else
  die "Geen install.sh gevonden. Gebruik FRESH_CLONE=1 of run vanuit de repo."
fi

[[ -x "$INSTALL_SCRIPT" ]] || die "Ontbreekt: ${INSTALL_SCRIPT}"

info "Start volledige installatie (install.sh)…"
export GARDEN_DIR="$INSTALL_DIR"
export GARDEN_USER="$SERVICE_USER"
export FRESH_INSTALL=1
exec bash "$INSTALL_SCRIPT"
