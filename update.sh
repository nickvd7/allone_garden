#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — snelle productie-update (zonder apt/system packages)
#
# Doet: git pull → npm install → frontend build (incl. SW cache-bust) →
#       alle DB-migraties → herstart allone-garden + nginx (indien aanwezig).
#
# Productie op /opt bijwerken (aanbevolen):
#   cd ~/coding/allone_garden && git pull
#   sudo bash scripts/deploy-to-production.sh
#   sudo bash /opt/allone-garden/update.sh
#
# Of alles in de clone:
#   cd ~/coding/allone_garden && git pull && sudo bash update.sh
#
# Detecteert automatisch de map waarin dit script staat (bijv. ~/coding/allone_garden).
# Bij sudo wordt git/npm gedraaid als de oorspronkelijke gebruiker (SUDO_USER), niet als
# een vaste "garden"-user — tenzij je GARDEN_USER=zet.
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
die()     { echo -e "${RED}[ERR]${RESET}  $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_PULL="${SCRIPT_DIR}/scripts/git-pull.sh"

resolve_install_dir() {
  if [[ -n "${GARDEN_DIR:-}" ]]; then
    echo "$GARDEN_DIR"
    return
  fi
  if [[ -d "${SCRIPT_DIR}/.git" ]]; then
    echo "$SCRIPT_DIR"
    return
  fi
  if [[ -d /opt/allone-garden/.git ]]; then
    echo /opt/allone-garden
    return
  fi
  echo "$SCRIPT_DIR"
}

INSTALL_DIR="$(resolve_install_dir)"
[[ -d "${INSTALL_DIR}/.git" ]] || die "Geen git-repo in ${INSTALL_DIR}. Zet GARDEN_DIR of run vanuit de clone."

# Wie voert git/npm uit?
if [[ -n "${GARDEN_USER:-}" ]]; then
  SERVICE_USER="$GARDEN_USER"
elif [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != root ]]; then
  SERVICE_USER="$SUDO_USER"
elif [[ $EUID -ne 0 ]]; then
  SERVICE_USER="$(whoami)"
else
  SERVICE_USER="$(stat -c '%U' "${INSTALL_DIR}" 2>/dev/null || echo garden)"
fi

[[ -x "$GIT_PULL" ]] || die "Ontbreekt: ${GIT_PULL} (eerst git pull vanaf GitHub)"

run_as() {
  local cmd="$1"
  if [[ "$(id -un)" == "$SERVICE_USER" ]]; then
    bash -c "$cmd"
  elif [[ $EUID -eq 0 ]] && command -v sudo &>/dev/null; then
    sudo -u "$SERVICE_USER" -H bash -c "$cmd"
  else
    [[ $EUID -eq 0 ]] || die "Run met sudo of als ${SERVICE_USER}"
    su - "$SERVICE_USER" -c "$cmd"
  fi
}

# Root alleen nodig voor systemctl/nginx; git/npm kan als gewone user
NEED_ROOT=false
if systemctl list-unit-files 'allone-garden.service' &>/dev/null 2>&1; then
  NEED_ROOT=true
fi
if systemctl is-active --quiet nginx 2>/dev/null; then
  NEED_ROOT=true
fi
if [[ $NEED_ROOT == true && $EUID -ne 0 ]]; then
  die "Herstart van systemd/nginx vereist sudo: sudo bash update.sh"
fi

echo -e "${BOLD}🌱 AllOne Garden — update${RESET}"
info "Installatie: ${INSTALL_DIR}"
info "Gebruiker:    ${SERVICE_USER}"

if [[ "${UPDATE_SKIP_GIT_PULL:-}" == 1 ]]; then
  warn "Git overgeslagen (UPDATE_SKIP_GIT_PULL=1)"
else
  info "Repository bijwerken…"
  if ! bash "$GIT_PULL" "$INSTALL_DIR" "$SERVICE_USER"; then
    warn "Git-update mislukt — build, migraties en herstart gaan door met de code die al op schijf staat."
    warn "Fix remote: git remote set-url origin https://github.com/nickvd7/allone_garden.git"
    warn "Bootstrap scripts zonder git: bash scripts/bootstrap-update-from-github.sh"
    warn "Of overslaan: UPDATE_SKIP_GIT_PULL=1 sudo bash update.sh"
  fi
fi
success "Code bijgewerkt ($(run_as "git -C '${INSTALL_DIR}' rev-parse --short HEAD"))"

info "Backend dependencies…"
run_as "cd '${INSTALL_DIR}/packages/backend' && npm install --production"

info "Frontend dependencies…"
run_as "cd '${INSTALL_DIR}/packages/frontend' && npm install"

info "Frontend build (service worker cache wordt vernieuwd)…"
run_as "cd '${INSTALL_DIR}/packages/frontend' && CI=false GENERATE_SOURCEMAP=false NODE_OPTIONS=--max-old-space-size=4096 npm run build"
if [[ $EUID -eq 0 ]]; then
  chmod -R a+rX "${INSTALL_DIR}/packages/frontend/build" 2>/dev/null || true
fi
success "Frontend gebouwd"

info "Database verbinding…"
SYNC_DB="${INSTALL_DIR}/scripts/sync-postgres-env.sh"
if ! run_as "cd '${INSTALL_DIR}/packages/backend' && node scripts/check-db-connection.js" 2>/dev/null; then
  if [[ $EUID -eq 0 && -x "$SYNC_DB" ]]; then
    warn "DATABASE_URL klopt niet met PostgreSQL — synchroniseer wachtwoord…"
    bash "$SYNC_DB" "$INSTALL_DIR" "$SERVICE_USER" || die "PostgreSQL sync mislukt. Zie scripts/sync-postgres-env.sh"
  else
    die "PostgreSQL login mislukt (user garden). Run: sudo bash scripts/sync-postgres-env.sh"
  fi
fi

info "Database migraties…"
run_as "cd '${INSTALL_DIR}/packages/backend' && npm run db:migrate"
success "Database up-to-date"

if [[ $EUID -eq 0 ]]; then
  if systemctl list-unit-files 'allone-garden.service' &>/dev/null 2>&1; then
    info "Herstart allone-garden…"
    systemctl restart allone-garden
    success "allone-garden herstart"
  else
    warn "Geen systemd unit 'allone-garden' — start de backend handmatig (pm2/node)."
  fi
  if systemctl is-active --quiet nginx 2>/dev/null; then
    nginx -t && systemctl restart nginx
    success "nginx herstart"
  fi
else
  warn "Geen sudo: systemd/nginx niet herstart. Doe dat zelf indien nodig."
fi

echo ""
echo -e "${GREEN}${BOLD}✅  Update voltooid${RESET}"
echo -e "  Pad:    ${INSTALL_DIR}"
echo -e "  Commit: ${BOLD}$(run_as "git -C '${INSTALL_DIR}' log -1 --oneline")${RESET}"
echo -e "  Tip: harde refresh in de browser of PWA-cache legen als de UI nog oud lijkt."
