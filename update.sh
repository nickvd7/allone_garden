#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — snelle productie-update (zonder apt/system packages)
#
# Doet: git pull → npm install → frontend build (incl. SW cache-bust) →
#       alle DB-migraties → herstart allone-garden + nginx.
#
# Gebruik op Raspberry Pi / Linux (na eerste install.sh):
#   sudo bash update.sh
#
# Zelfde paden als install.sh: GARDEN_DIR, GARDEN_USER.
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
die()     { echo -e "${RED}[ERR]${RESET}  $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && die "Run met sudo: sudo bash update.sh"

INSTALL_DIR="${GARDEN_DIR:-/opt/allone-garden}"
SERVICE_USER="${GARDEN_USER:-garden}"
REPO_URL="${GARDEN_REPO:-https://github.com/nickvd7/allone_garden.git}"

[[ -d "${INSTALL_DIR}/.git" ]] || die "Geen installatie in ${INSTALL_DIR}. Eerst: sudo bash install.sh"

echo -e "${BOLD}🌱 AllOne Garden — update${RESET}"

info "Repository bijwerken…"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "$INSTALL_DIR" 2>/dev/null || true
if ! su -c "env GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false git \
    -C '${INSTALL_DIR}' \
    -c safe.directory='${INSTALL_DIR}' \
    -c credential.helper='' \
    -c core.askPass='' \
    pull --ff-only" "$SERVICE_USER"; then
  die "git pull mislukt in ${INSTALL_DIR}"
fi
success "Code bijgewerkt ($(su -c "git -C '${INSTALL_DIR}' rev-parse --short HEAD" "$SERVICE_USER"))"

info "Backend dependencies…"
su -c "cd '${INSTALL_DIR}/packages/backend' && npm install --production" "$SERVICE_USER"

info "Frontend dependencies…"
su -c "cd '${INSTALL_DIR}/packages/frontend' && npm install" "$SERVICE_USER"

info "Frontend build (service worker cache wordt vernieuwd)…"
su -c "cd '${INSTALL_DIR}/packages/frontend' && CI=false GENERATE_SOURCEMAP=false NODE_OPTIONS=--max-old-space-size=4096 npm run build" "$SERVICE_USER"
success "Frontend gebouwd"

info "Database migraties…"
su -c "cd '${INSTALL_DIR}/packages/backend' && npm run db:migrate" "$SERVICE_USER"
success "Database up-to-date"

info "Services herstarten…"
systemctl restart allone-garden
if systemctl is-active --quiet nginx 2>/dev/null; then
  nginx -t && systemctl restart nginx
fi
success "allone-garden (en nginx) herstart"

echo ""
echo -e "${GREEN}${BOLD}✅  Update voltooid${RESET}"
echo -e "  Commit: ${BOLD}$(su -c "git -C '${INSTALL_DIR}' log -1 --oneline" "$SERVICE_USER")${RESET}"
echo -e "  Tip: harde refresh in de browser of PWA-cache legen als de UI nog oud lijkt."
