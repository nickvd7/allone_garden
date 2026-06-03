#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — schone (her)installatie op Raspberry Pi / Debian
#
# Aanbevolen workflow (git pull, geen curl):
#   cd ~/coding/allone_garden    # jouw clone
#   git pull                     # of: laat install-fresh git-pull.sh doen
#   sudo bash install-fresh.sh
#
# Standaard vanuit een clone: code in die map, git-pull, nieuwe .env, volledige install.
# Productie naar /opt:
#   sudo GARDEN_DEPLOY=/opt/allone-garden bash install-fresh.sh
#
# Variabelen:
#   GARDEN_DIR          — installatiemap (default: map van dit script)
#   GARDEN_DEPLOY       — kopieer repo hierheen vóór install (bijv. /opt/allone-garden)
#   GARDEN_USER         — unix-user (default: eigenaar van GARDEN_DIR, of garden voor /opt)
#   FRESH_CLONE=1       — verse git clone naar GARDEN_DIR (curl / zonder lokale repo)
#   RUN_GIT_PULL=0      — geen git-pull.sh (als je net handmatig git pull deed)
#   FRESH_INSTALL=1     — nieuwe .env (standaard aan)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
die()     { echo -e "${RED}[ERR]${RESET}  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run met sudo: sudo bash install-fresh.sh"

REPO_URL="https://github.com/nickvd7/allone_garden.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || SCRIPT_DIR=""
IN_REPO=false
[[ -n "$SCRIPT_DIR" && -d "${SCRIPT_DIR}/.git" && -f "${SCRIPT_DIR}/install.sh" ]] && IN_REPO=true

# ── Defaults afhankelijk van context ───────────────────────────────────────────
if [[ -z "${FRESH_CLONE:-}" ]]; then
  if $IN_REPO; then FRESH_CLONE=0; else FRESH_CLONE=1; fi
fi

if [[ -z "${GARDEN_DIR:-}" ]]; then
  if [[ -n "${GARDEN_DEPLOY:-}" ]]; then
    GARDEN_DIR="$GARDEN_DEPLOY"
  elif $IN_REPO && [[ "$FRESH_CLONE" == 0 ]]; then
    GARDEN_DIR="$SCRIPT_DIR"
  else
    GARDEN_DIR="/opt/allone-garden"
  fi
fi

INSTALL_DIR="$(cd "$GARDEN_DIR" 2>/dev/null && pwd || echo "$GARDEN_DIR")"

if [[ -z "${GARDEN_USER:-}" ]]; then
  if [[ "$INSTALL_DIR" == /opt/* ]]; then
    GARDEN_USER="garden"
  else
    GARDEN_USER="$(stat -c '%U' "$INSTALL_DIR" 2>/dev/null || echo "${SUDO_USER:-root}")"
  fi
fi

RUN_GIT_PULL="${RUN_GIT_PULL:-1}"
GIT_PULL_USER="${SUDO_USER:-$GARDEN_USER}"
[[ "$GIT_PULL_USER" == root ]] && GIT_PULL_USER="$GARDEN_USER"

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  🌱  AllOne Garden — schone installatie      ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${RESET}"
info "Bron-repo:    ${SCRIPT_DIR:-<curl>}"
info "Installeren:  ${INSTALL_DIR}"
info "Gebruiker:    ${GARDEN_USER}"
info "Fresh clone:  ${FRESH_CLONE}"
info "Git pull:     ${RUN_GIT_PULL}"

if systemctl is-active --quiet allone-garden 2>/dev/null; then
  info "Stoppen allone-garden…"
  systemctl stop allone-garden
fi

# ── Code bijwerken in de clone (git pull zonder wachtwoordprompt) ─────────────
if $IN_REPO && [[ "$RUN_GIT_PULL" == 1 ]] && [[ -x "${SCRIPT_DIR}/scripts/git-pull.sh" ]]; then
  info "Repository bijwerken (git-pull.sh)…"
  if bash "${SCRIPT_DIR}/scripts/git-pull.sh" "$SCRIPT_DIR" "$GIT_PULL_USER"; then
    success "Git bijgewerkt in ${SCRIPT_DIR}"
  else
    warn "git-pull.sh mislukt — ga door met code op schijf (of eerst: git pull)"
  fi
fi

# ── Optioneel: deploy clone → /opt (of andere map) ───────────────────────────
if [[ -n "${GARDEN_DEPLOY:-}" ]]; then
  DEPLOY_DIR="$(mkdir -p "$GARDEN_DEPLOY" && cd "$GARDEN_DEPLOY" && pwd)"
  SOURCE="${SCRIPT_DIR:-$INSTALL_DIR}"
  [[ -d "$SOURCE" ]] || die "Geen bronmap om te kopiëren: ${SOURCE}"
  if [[ -d "$DEPLOY_DIR" && "$DEPLOY_DIR" != "$SOURCE" ]]; then
    BACKUP="${DEPLOY_DIR}.bak.$(date +%Y%m%d%H%M%S)"
    if [[ -f "${DEPLOY_DIR}/packages/backend/.env" ]] || [[ -d "${DEPLOY_DIR}/packages/frontend/build" ]]; then
      info "Backup ${DEPLOY_DIR} → ${BACKUP}"
      mv "$DEPLOY_DIR" "$BACKUP"
      mkdir -p "$DEPLOY_DIR"
    fi
  fi
  info "Kopiëren ${SOURCE} → ${DEPLOY_DIR}…"
  rsync -a --delete \
    --exclude node_modules \
    --exclude packages/backend/node_modules \
    --exclude packages/frontend/node_modules \
    --exclude packages/frontend/build \
    --exclude '.git' \
    "${SOURCE}/" "${DEPLOY_DIR}/"
  INSTALL_DIR="$DEPLOY_DIR"
  GARDEN_USER="${GARDEN_USER:-garden}"
  success "Broncode gedeployed naar ${INSTALL_DIR}"
fi

# ── Verse clone (alleen zonder lokale repo / expliciet FRESH_CLONE=1) ─────────
if [[ "$FRESH_CLONE" == 1 && ! ($IN_REPO && "$INSTALL_DIR" == "$SCRIPT_DIR") ]]; then
  if [[ -d "$INSTALL_DIR" ]]; then
    BACKUP="${INSTALL_DIR}.bak.$(date +%Y%m%d%H%M%S)"
    info "Backup → ${BACKUP}"
    mv "$INSTALL_DIR" "$BACKUP"
  fi
  info "Clonen ${REPO_URL}…"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  env -u GIT_ASKPASS -u SSH_ASKPASS GIT_TERMINAL_PROMPT=0 \
    git -c credential.helper= -c core.askPass= \
    clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
  success "Clone in ${INSTALL_DIR}"
fi

INSTALL_SCRIPT="${INSTALL_DIR}/install.sh"
[[ -f "$INSTALL_SCRIPT" ]] || die "Geen install.sh in ${INSTALL_DIR}"

info "Start install.sh (FRESH_INSTALL)…"
export GARDEN_DIR="$INSTALL_DIR"
export GARDEN_USER="$GARDEN_USER"
export FRESH_INSTALL="${FRESH_INSTALL:-1}"
exec bash "$INSTALL_SCRIPT"
