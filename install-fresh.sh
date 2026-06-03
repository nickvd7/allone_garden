#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — schone (her)installatie op Raspberry Pi / Debian
#
# Pi-architectuur (aanbevolen):
#   ~/coding/allone_garden  = git working copy
#   /opt/allone-garden      = productie (via reinstall-pi.sh / deploy-to-production.sh)
#
# Gebruik Pi-herinstall (geen git clone op /opt):
#   cd ~/coding/allone_garden && git pull && sudo bash reinstall-pi.sh
#
# Variabelen:
#   GARDEN_DIR / GARDEN_DEPLOY / GARDEN_USER / FRESH_INSTALL / RUN_GIT_PULL
#   FRESH_CLONE=1  — alleen zonder lokale repo: tarball van GitHub (geen git login)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
die()     { echo -e "${RED}[ERR]${RESET}  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run met sudo: sudo bash install-fresh.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || SCRIPT_DIR=""
IN_REPO=false
[[ -n "$SCRIPT_DIR" && -f "${SCRIPT_DIR}/install.sh" ]] && IN_REPO=true

if [[ -z "${FRESH_CLONE:-}" ]]; then
  # Vanuit een clone: nooit git clone naar /opt — gebruik reinstall-pi.sh
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
info "Bron:         ${SCRIPT_DIR:-<geen>}"
info "Installeren:  ${INSTALL_DIR}"
info "Gebruiker:    ${GARDEN_USER}"
info "Fresh clone:  ${FRESH_CLONE}"

if systemctl is-active --quiet allone-garden 2>/dev/null; then
  info "Stoppen allone-garden…"
  systemctl stop allone-garden
fi

# Git bijwerken in werk-copy (niet op /opt)
if $IN_REPO && [[ "$RUN_GIT_PULL" == 1 ]] && [[ -x "${SCRIPT_DIR}/scripts/git-pull.sh" ]]; then
  info "Repository bijwerken (git-pull.sh)…"
  bash "${SCRIPT_DIR}/scripts/git-pull.sh" "$SCRIPT_DIR" "$GIT_PULL_USER" || warn "git-pull mislukt"
fi

# deploy-to-production (expliciet GARDEN_DEPLOY)
if [[ -n "${GARDEN_DEPLOY:-}" && -x "${SCRIPT_DIR}/scripts/deploy-to-production.sh" ]]; then
  SOURCE_DIR="${SCRIPT_DIR}" PRODUCTION_DIR="${GARDEN_DEPLOY}" PRODUCTION_USER="${GARDEN_USER}" \
    bash "${SCRIPT_DIR}/scripts/deploy-to-production.sh"
  INSTALL_DIR="$(cd "$GARDEN_DEPLOY" && pwd)"
fi

# Verse bron alleen zonder lokale repo: tarball (geen git credentials)
if [[ "$FRESH_CLONE" == 1 ]]; then
  FETCH="${SCRIPT_DIR}/scripts/fetch-github-tree.sh"
  if [[ ! -x "$FETCH" && -n "${SCRIPT_DIR}" ]]; then
    die "fetch-github-tree.sh ontbreekt — run eerst: cd ~/coding/allone_garden && git pull"
  fi
  if [[ -x "$FETCH" ]]; then
    bash "$FETCH" "$INSTALL_DIR"
  else
    die "Geen lokale repo en geen fetch-script. Gebruik: sudo bash reinstall-pi.sh vanuit ~/coding/allone_garden"
  fi
fi

[[ -f "${INSTALL_DIR}/install.sh" ]] || die "Geen install.sh in ${INSTALL_DIR}"

info "Start install.sh…"
export GARDEN_DIR="$INSTALL_DIR"
export GARDEN_USER="$GARDEN_USER"
export FRESH_INSTALL="${FRESH_INSTALL:-1}"
exec bash "${INSTALL_DIR}/install.sh"
