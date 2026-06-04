#!/usr/bin/env bash
# Voeg ontbrekende productie-keys toe aan packages/backend/.env (geen overschrijven).
# Usage: bash scripts/merge-production-env.sh [INSTALL_DIR] [SERVICE_USER]
set -euo pipefail

INSTALL_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_USER="${2:-}"
ENV_FILE="${INSTALL_DIR}/packages/backend/.env"
DEFAULTS="${INSTALL_DIR}/packages/backend/env.production.defaults"

[[ -f "$DEFAULTS" ]] || exit 0
[[ -f "$ENV_FILE" ]] || exit 0

added=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "$line" ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  [[ -z "$key" ]] && continue
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    continue
  fi
  printf '\n%s\n' "$line" >> "$ENV_FILE"
  added=$((added + 1))
done < "$DEFAULTS"

if [[ "$added" -gt 0 ]]; then
  echo "[merge-env] ${added} key(s) toegevoegd aan ${ENV_FILE}"
fi

if [[ -n "$SERVICE_USER" ]]; then
  chown "${SERVICE_USER}:${SERVICE_USER}" "$ENV_FILE" 2>/dev/null || true
  chmod 600 "$ENV_FILE" 2>/dev/null || true
fi
