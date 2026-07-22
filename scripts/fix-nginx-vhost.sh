#!/usr/bin/env bash
# Herstel nginx vhost + hardened limits (vervangt oude fix-nginx-vhost flow).
#   sudo bash scripts/fix-nginx-vhost.sh [install-dir]
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run met sudo"; exit 1; }

INSTALL_DIR="${1:-}"
if [[ -z "$INSTALL_DIR" && -f /etc/systemd/system/allone-garden.service ]]; then
  _wd="$(grep -E '^WorkingDirectory=' /etc/systemd/system/allone-garden.service 2>/dev/null | cut -d= -f2- || true)"
  if [[ -n "$_wd" ]]; then
    INSTALL_DIR="$(cd "${_wd}/../.." && pwd)"
  fi
fi
if [[ -z "$INSTALL_DIR" ]]; then
  for d in /opt/allone-garden "$HOME/coding/allone_garden"; do
    [[ -f "$d/packages/backend/.env" ]] && INSTALL_DIR="$d" && break
  done
fi
[[ -n "$INSTALL_DIR" && -d "${INSTALL_DIR}/packages/frontend/build" ]] \
  || { echo "Geen geldige install-dir met frontend build: ${INSTALL_DIR:-?}"; exit 1; }

SCRIPT_SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Prefer explicit env, then APP_URL from production .env (no hardcoded upstream domain).
if [[ -z "${GARDEN_DOMAIN:-}" && -f "${INSTALL_DIR}/packages/backend/.env" ]]; then
  _app_url="$(grep -E '^APP_URL=' "${INSTALL_DIR}/packages/backend/.env" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)"
  if [[ "$_app_url" =~ ^https?://([^/]+) ]]; then
    GARDEN_DOMAIN="${BASH_REMATCH[1]}"
  fi
fi
GARDEN_DOMAIN="${GARDEN_DOMAIN:-}" \
  bash "${SCRIPT_SELF_DIR}/apply-nginx-hardening.sh" "$INSTALL_DIR"
