#!/usr/bin/env bash
# Schakelt onderlinge overload-modus in: nginx toont 503 i.p.v. alles door te sturen.
# Draait elke minuut via cron (install via apply-nginx-hardening.sh).
#
# Overschrijf drempels via /etc/default/allone-garden-overload (KEY=value).
set -euo pipefail

ENV_FILE="${OVERLOAD_ENV:-/etc/default/allone-garden-overload}"
[[ -f "$ENV_FILE" ]] && # shellcheck disable=SC1090
  source "$ENV_FILE"

MAX_HTTPS_CONN="${MAX_HTTPS_CONN:-80}"
MAX_LOAD_1M="${MAX_LOAD_1M:-3.5}"
COOLDOWN_CONN="${COOLDOWN_CONN:-40}"
COOLDOWN_LOAD="${COOLDOWN_LOAD:-2.0}"
FLAG="${OVERLOAD_FLAG:-/var/run/allone-garden-overload}"
LOG="${OVERLOAD_LOG:-/var/log/allone-garden-overload.log}"

https_conn() {
  ss -Htn state established '( sport = :443 )' 2>/dev/null | wc -l | tr -d ' '
}

load_1m() {
  awk '{print $1}' /proc/loadavg
}

log() {
  echo "$(date -Iseconds) $*" >> "$LOG"
  tail -n 200 "$LOG" > "${LOG}.tmp" 2>/dev/null && mv "${LOG}.tmp" "$LOG" 2>/dev/null || true
}

CONN="$(https_conn)"
LOAD="$(load_1m)"

trigger() {
  awk -v c="$CONN" -v mc="$MAX_HTTPS_CONN" -v l="$LOAD" -v ml="$MAX_LOAD_1M" \
    'BEGIN { exit !((c >= mc) || (l >= ml)) }'
}

cooldown() {
  awk -v c="$CONN" -v cc="$COOLDOWN_CONN" -v l="$LOAD" -v cl="$COOLDOWN_LOAD" \
    'BEGIN { exit !((c <= cc) && (l <= cl)) }'
}

if [[ -f "$FLAG" ]]; then
  if cooldown; then
    rm -f "$FLAG"
    log "OK overload uit — conn=${CONN} load=${LOAD}"
  else
    log "overload actief — conn=${CONN} load=${LOAD}"
  fi
else
  if trigger; then
    touch "$FLAG"
    log "OVERLOAD aan — conn=${CONN} load=${LOAD} (drempel conn>=${MAX_HTTPS_CONN} load>=${MAX_LOAD_1M})"
  fi
fi
