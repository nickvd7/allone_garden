#!/usr/bin/env bash
# =============================================================================
# AllOne Garden — SSL via Let's Encrypt (idempotent, herbruikbaar)
#
# Wordt aangeroepen door install.sh, update.sh en fix-nginx-vhost.sh, zodat de
# 443-vhost na ELKE nginx-herconfiguratie opnieuw wordt aangezet.
#
# Methode:
#   • Bestaat er al een cert → alleen opnieuw in nginx koppelen (--redirect).
#   • TransIP-credentials aanwezig → DNS-01 (geen open poorten nodig).
#   • Anders → HTTP-only, met uitleg.
#
# Usage: sudo bash scripts/setup-ssl.sh
#   GARDEN_DOMAIN=allone.garden
#   GARDEN_EMAIL=you@example.com
#   GARDEN_TRANSIP_INI=/etc/letsencrypt/transip.ini
#   GARDEN_CERT_DOMAINS="allone.garden www.allone.garden api.allone.garden"
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[ssl]${RESET}  $*"; }
success() { echo -e "${GREEN}[ssl]${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[ssl]${RESET}  $*"; }

[[ $EUID -eq 0 ]] || { echo "[ssl] Run met sudo"; exit 1; }

DOMAIN="${GARDEN_DOMAIN:-allone.garden}"
EMAIL="${GARDEN_EMAIL:-admin@${DOMAIN}}"
TRANSIP_INI="${GARDEN_TRANSIP_INI:-/etc/letsencrypt/transip.ini}"
read -r -a CERT_DOMAINS <<< "${GARDEN_CERT_DOMAINS:-${DOMAIN} www.${DOMAIN} api.${DOMAIN}}"

if ! command -v certbot &>/dev/null; then
  warn "certbot niet geïnstalleerd — sla SSL over. (apt-get install certbot python3-certbot-nginx)"
  exit 0
fi

LIVE="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

wire_into_nginx() {
  info "Cert koppelen aan nginx (443 + HTTP→HTTPS redirect)…"
  if certbot install --nginx --cert-name "$DOMAIN" --redirect 2>&1 | tail -5; then
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    for _d in /opt/allone-garden "$HOME/coding/allone_garden"; do
      if [[ -x "${_d}/scripts/ensure-nginx-ssl-hardening.sh" ]]; then
        printf '[ -x "%s/scripts/ensure-nginx-ssl-hardening.sh" ] && bash "%s/scripts/ensure-nginx-ssl-hardening.sh"\n' "$_d" "$_d" \
          >> /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
        break
      fi
    done
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
    success "HTTPS actief voor ${DOMAIN}"
    return 0
  fi
  warn "certbot install --nginx gaf een fout — check: sudo nginx -t"
  return 1
}

# ── 1. Bestaand certificaat → alleen opnieuw koppelen ─────────────────────────
if [[ -f "$LIVE" ]]; then
  info "Bestaand certificaat gevonden (${DOMAIN})"
  wire_into_nginx || true
  if systemctl list-timers --all 2>/dev/null | grep -q certbot; then
    systemctl enable --now certbot.timer 2>/dev/null || true
  fi
  exit 0
fi

# ── 2. TransIP DNS-01 (geen open poorten) ─────────────────────────────────────
if [[ -f "$TRANSIP_INI" ]]; then
  info "TransIP-credentials gevonden → DNS-01 voor: ${CERT_DOMAINS[*]}"
  chmod 600 "$TRANSIP_INI" 2>/dev/null || true

  if ! certbot plugins 2>/dev/null | grep -q 'dns-transip'; then
    info "certbot-dns-transip plugin installeren…"
    apt-get install -y -qq python3-pip >/dev/null 2>&1 || true
    pip3 install --break-system-packages certbot-dns-transip >/dev/null 2>&1 \
      || pip3 install certbot-dns-transip >/dev/null 2>&1 \
      || warn "Kon plugin niet installeren — handmatig: sudo pip3 install certbot-dns-transip --break-system-packages"
  fi

  if certbot plugins 2>/dev/null | grep -q 'dns-transip'; then
    _ARGS=(); for _d in "${CERT_DOMAINS[@]}"; do _ARGS+=( -d "$_d" ); done
    if certbot certonly -n \
        -a dns-transip \
        --dns-transip-credentials "$TRANSIP_INI" \
        --dns-transip-propagation-seconds 300 \
        "${_ARGS[@]}" \
        -m "$EMAIL" --agree-tos 2>&1 | tail -10; then
      success "Certificaat uitgegeven via TransIP DNS-01"
      wire_into_nginx || true
      if systemctl list-timers --all 2>/dev/null | grep -q certbot; then
        systemctl enable --now certbot.timer 2>/dev/null || true
        success "Auto-renewal actief (certbot.timer)"
      fi
      exit 0
    else
      warn "certbot (TransIP DNS-01) faalde. Mogelijke oorzaken:"
      warn "  • Verkeerde dns_transip_username of key-bestand in ${TRANSIP_INI}"
      warn "  • API niet aangezet, of IP-whitelisting staat aan (uitzetten)"
      warn "  • DNSSEC stuk op de zone"
      warn "Log: sudo cat /var/log/letsencrypt/letsencrypt.log"
      exit 1
    fi
  fi
fi

# ── 3. Geen cert, geen TransIP ────────────────────────────────────────────────
warn "Geen certificaat en geen TransIP-credentials op ${TRANSIP_INI}."
warn "Voor SSL: leg TransIP-credentials neer en run opnieuw, of gebruik HTTP op het LAN."
exit 0
