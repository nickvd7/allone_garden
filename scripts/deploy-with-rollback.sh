#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — deploy with automatic rollback to last-known-good commit
#
# Usage (on the Pi, usually via GitHub Actions self-hosted runner):
#   sudo bash scripts/deploy-with-rollback.sh
#
# Flow:
#   1. Remember LAST_GOOD SHA (file) and snapshot /opt → .prev
#   2. git pull + deploy.sh
#   3. Health-check; on success write NEW_SHA as last-good
#   4. On failure: git reset --hard LAST_GOOD, restore /opt from .prev, restart
#
# Env overrides:
#   GARDEN_SOURCE_DIR     git clone (default: script repo root)
#   GARDEN_DEPLOY_DIR     production dir (default: /opt/allone-garden)
#   GARDEN_LAST_GOOD_FILE path to SHA file (default: /var/lib/allone-garden/last-good-commit)
#   GARDEN_HEALTH_URLS    space-separated URLs (default: local + https://allone.garden)
#   GARDEN_HEALTH_RETRIES attempts (default: 8)
#   GARDEN_HEALTH_SLEEP   seconds between retries (default: 5)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; RESET='\033[0m'
info()  { echo -e "${CYAN}[deploy-rb]${RESET} $*"; }
ok()    { echo -e "${GREEN}[deploy-rb]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[deploy-rb]${RESET} $*"; }
die()   { echo -e "${RED}[deploy-rb]${RESET} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run met sudo: sudo bash scripts/deploy-with-rollback.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${GARDEN_SOURCE_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
PROD="${GARDEN_DEPLOY_DIR:-/opt/allone-garden}"
PREV="${PROD}.prev"
LAST_GOOD_FILE="${GARDEN_LAST_GOOD_FILE:-/var/lib/allone-garden/last-good-commit}"
HEALTH_RETRIES="${GARDEN_HEALTH_RETRIES:-8}"
HEALTH_SLEEP="${GARDEN_HEALTH_SLEEP:-5}"
GIT_USER="${SUDO_USER:-$(stat -c '%U' "$SOURCE_DIR" 2>/dev/null || echo "${GARDEN_USER:-garden}")}"

run_git() {
  if [[ "$GIT_USER" != "root" ]] && id "$GIT_USER" &>/dev/null; then
    sudo -u "$GIT_USER" git -C "$SOURCE_DIR" "$@"
  else
    git -C "$SOURCE_DIR" "$@"
  fi
}
# Prefer local health first (does not depend on Cloudflare/DNS).
DEFAULT_HEALTH_URLS="http://127.0.0.1/api/health http://127.0.0.1:5000/api/health"
if [[ -f "${PROD}/packages/backend/.env" ]]; then
  _app="$(grep -E '^APP_URL=' "${PROD}/packages/backend/.env" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)"
  if [[ -n "$_app" ]]; then
    DEFAULT_HEALTH_URLS="${DEFAULT_HEALTH_URLS} ${_app%/}/api/health"
  fi
fi
DEFAULT_HEALTH_URLS="${DEFAULT_HEALTH_URLS} https://allone.garden/api/health"
# shellcheck disable=SC2206
HEALTH_URLS=(${GARDEN_HEALTH_URLS:-$DEFAULT_HEALTH_URLS})

[[ -f "${SOURCE_DIR}/deploy.sh" ]] || die "Geen deploy.sh in ${SOURCE_DIR}"
[[ -d "$PROD" ]] || die "Productie-map ontbreekt: ${PROD}"

mkdir -p "$(dirname "$LAST_GOOD_FILE")"

git_sha() {
  run_git rev-parse HEAD 2>/dev/null || true
}

health_ok() {
  local url
  for url in "${HEALTH_URLS[@]}"; do
    [[ -z "$url" ]] && continue
    if curl -fsS --max-time 10 "$url" >/dev/null 2>&1; then
      info "Health OK: ${url}"
      return 0
    fi
  done
  return 1
}

wait_healthy() {
  local i
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if health_ok; then
      return 0
    fi
    warn "Health-check poging ${i}/${HEALTH_RETRIES} mislukt — wacht ${HEALTH_SLEEP}s…"
    sleep "$HEALTH_SLEEP"
  done
  return 1
}

rollback() {
  local reason="$1"
  warn "ROLLBACK: ${reason}"

  if [[ -f "$LAST_GOOD_FILE" ]]; then
    local good
    good="$(tr -d '[:space:]' < "$LAST_GOOD_FILE")"
    if [[ -n "$good" ]] && run_git cat-file -e "${good}^{commit}" 2>/dev/null; then
      info "git reset --hard ${good} (as ${GIT_USER})"
      run_git reset --hard "$good"
    else
      warn "last-good SHA ongeldig of ontbreekt in git object store: ${good:-empty}"
    fi
  else
    warn "Geen last-good-commit bestand — alleen filesystem-snapshot herstellen"
  fi

  if [[ -d "$PREV" ]]; then
    info "Herstel ${PROD} vanuit ${PREV}…"
    # Keep current .env if prev somehow lacks it (should not happen).
    rsync -a --delete \
      --exclude 'packages/backend/.env' \
      "${PREV}/" "${PROD}/"
    if [[ -f "${PREV}/packages/backend/.env" ]]; then
      cp -a "${PREV}/packages/backend/.env" "${PROD}/packages/backend/.env"
    fi
    chown -R "${GARDEN_USER:-garden}:${GARDEN_USER:-garden}" "$PROD" 2>/dev/null || true
  else
    warn "Geen snapshot ${PREV} — probeer deploy.sh vanaf reset clone"
    if [[ -f "${SOURCE_DIR}/deploy.sh" ]]; then
      DEPLOY_GIT_PULL=0 GARDEN_DEPLOY_DIR="$PROD" bash "${SOURCE_DIR}/deploy.sh" || true
    fi
  fi

  systemctl restart allone-garden || true
  systemctl reload nginx 2>/dev/null || true
  sleep 3

  if wait_healthy; then
    ok "Rollback geslaagd — vorige werkende deploy draait weer"
  else
    echo -e "${RED}${BOLD}ROLLBACK HEALTH MISLUKT — handmatige interventie nodig${RESET}" >&2
    echo "  Zie: sudo journalctl -u allone-garden -n 80" >&2
    echo "  Snapshot: ${PREV}" >&2
    echo "  last-good: ${LAST_GOOD_FILE}" >&2
  fi
  return 1
}

echo -e "${BOLD}🌱 AllOne Garden — deploy with rollback${RESET}"

BEFORE_SHA="$(git_sha)"
if [[ -f "$LAST_GOOD_FILE" ]]; then
  LAST_GOOD="$(tr -d '[:space:]' < "$LAST_GOOD_FILE")"
  info "Last-known-good: ${LAST_GOOD}"
else
  LAST_GOOD="$BEFORE_SHA"
  info "Geen last-good nog — gebruik huidige HEAD als vangnet: ${LAST_GOOD:-unknown}"
  if [[ -n "$LAST_GOOD" ]]; then
    printf '%s\n' "$LAST_GOOD" > "$LAST_GOOD_FILE"
  fi
fi

# ── Snapshot production (fast rollback without rebuild) ───────────────────────
info "Snapshot ${PROD} → ${PREV}…"
mkdir -p "$PREV"
rsync -a --delete "${PROD}/" "${PREV}/"
ok "Snapshot klaar"

# ── Deploy ────────────────────────────────────────────────────────────────────
info "Deploy starten…"
set +e
DEPLOY_GIT_PULL="${DEPLOY_GIT_PULL:-1}" \
  GARDEN_DEPLOY_DIR="$PROD" bash "${SOURCE_DIR}/deploy.sh"
DEPLOY_RC=$?
set -e

NEW_SHA="$(git_sha)"
info "Nieuwe SHA: ${NEW_SHA:-unknown} (was ${BEFORE_SHA:-unknown})"

if [[ $DEPLOY_RC -ne 0 ]]; then
  rollback "deploy.sh exit ${DEPLOY_RC}" || true
  die "Deploy mislukt — teruggedraaid naar last-known-good"
fi

info "Health-check na deploy…"
if wait_healthy; then
  if [[ -n "$NEW_SHA" ]]; then
    printf '%s\n' "$NEW_SHA" > "$LAST_GOOD_FILE"
    ok "last-good-commit → ${NEW_SHA}"
  fi
  echo ""
  echo -e "${GREEN}${BOLD}✅  Deploy OK${RESET} → ${PROD}"
  echo -e "  SHA: ${NEW_SHA}"
  exit 0
fi

rollback "health-check failed na deploy van ${NEW_SHA:-unknown}" || true
die "Deploy ongezond — teruggedraaid naar ${LAST_GOOD:-vorige snapshot}"
