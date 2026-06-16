# Security hardening (production)

Short guide for what the backend expects and what you still need to configure outside the code. Full env list: `PRODUCTION_ENV_TEMPLATE.md`.

---

## Network and reverse proxy

| Topic | Recommendation |
|-------|----------------|
| **HTTPS** | Terminate TLS on your reverse proxy (nginx, Caddy, Traefik, Cloudflare) and expose only HTTPS externally. |
| **`TRUST_PROXY`** | Set this when the app runs behind 1+ proxies so `req.ip` and rate limiting see the real client IP. Typically `1` for one proxy layer. See `packages/backend/src/config/networkSecurity.js`. |
| **`FRONTEND_URL`** | One or **multiple** allowed browser origins, **comma-separated** (same list for REST CORS and Socket.IO). Example: `https://app.example.com,https://www.example.com`. |

**Docker Compose:** in `docker-compose.yml`, the backend service defaults to `TRUST_PROXY=1` and `PLUGIN_STRICT_CAPABILITIES=true` (override via root `.env` if needed).

---

## Authentication and tokens

| Topic | Recommendation |
|-------|----------------|
| **`JWT_SECRET`** | At least 32 characters, cryptographically random; rotate only with planned logout of all clients. |
| **Algorithm** | Code uses **HS256** explicitly for sign and verify. |
| **Redis** | Set `REDIS_URL` in production so rate limits and token revocation stay consistent across processes. |

---

## Plugins

| Topic | Recommendation |
|-------|----------------|
| **Strict mode** | In `NODE_ENV=production`, plugins must have an explicit `capabilities` array; otherwise they are not loaded. Optional: `PLUGIN_STRICT_CAPABILITIES=true` outside production too. |
| **Community plugins** | Only trusted code in `plugins/community/`; plugins run in a sandbox but still impact via API/events. |

---

## WebRTC (video)

| Topic | Recommendation |
|-------|----------------|
| **STUN** | Default Google STUN is often enough for testing; consider your own STUN for production. |
| **TURN** | For users behind strict NAT/firewall: configure `WEBRTC_TURN_URL` + username/password on the backend (see `packages/backend/.env.example`). |

---

## Email

| Topic | Recommendation |
|-------|----------------|
| **SMTP** | Set `SMTP_*` and `APP_URL` for password reset links; without SMTP, resets go to logs (only acceptable in controlled environments). |
| **From address** | Use a domain with SPF/DKIM if deliverability matters. |

---

## Logging and monitoring

| Topic | Recommendation |
|-------|----------------|
| **Audit lines** | `[AUDIT]` lines to stdout are structured (JSON); in production send to a log stack (and limit retention/access). |
| **No secrets** | Ensure app and proxy logs do not contain passwords, JWTs, or API keys. |
| **Alerts** | Monitor `/health`, error rates, and DB/Redis availability. |

---

## Desktop (Electron)

| Topic | Recommendation |
|-------|----------------|
| **Steam** | `STEAM_APP_ID` or `packages/desktop/steam_appid.txt` — only real App ID in releases. |
| **Discord** | `DISCORD_APP_ID` for Rich Presence; optional. |
| **Updates** | `electron-updater` needs a reliable HTTPS `latest.yml` source (e.g. GitHub Releases). |

---

## CI / secrets

- **Mobile (Android/iOS):** signing secrets in GitHub Actions; iOS build runs only when Apple secrets are set.
- **Repo:** no real secrets in code; use your platform’s secret store.

---

## What may still be open (not fixed automatically by code)

- Choose **production host** and run `docker-compose` or your orchestration.
- **DNS + TLS certificates** for your public URLs.
- **Steam / Discord / Apple** developer accounts and IDs if you do not have them yet.
- **Real translations** for locale files that still partly use the English baseline.
- **Feature roadmap** (push notifications, offline mobile, season system, marketplace UI, etc.) if you want to build them — separate from security baseline.

---

## Home server: overload & network isolation (Raspberry Pi)

Goal: when **allone.garden** is under heavy load, **only the website** should degrade (503 / rate limits) — not your entire home network or router.

### Apply on the Pi (one command)

After `git pull` on the Pi:

```bash
cd /opt/allone-garden
sudo GARDEN_EMAIL=jouw@email.nl bash scripts/apply-nginx-hardening.sh
```

This installs:

| Layer | What it does |
|-------|----------------|
| **nginx limits** | Max ~100 concurrent site connections; per-IP caps; API/auth rate limits |
| **Socket.IO cap** | Max 8 websocket connections per IP |
| **Overload guard** (cron, every minute) | At high load/connections → temporary **503** page (site “off”, Pi stops accepting more) |
| **systemd** | `MemoryMax=768M`, `CPUQuota=75%` on `allone-garden` — backend cannot consume entire Pi |
| **fail2ban** | Blocks IPs hammering `/api/auth/login` |

Tune thresholds in `/etc/default/allone-garden-overload`:

```bash
MAX_HTTPS_CONN=80    # HTTPS connections before 503 mode
MAX_LOAD_1M=3.5      # 1-minute load average (Pi cores)
COOLDOWN_CONN=40     # hysteresis: overload off when below this
COOLDOWN_LOAD=2.0
```

Logs: `/var/log/allone-garden-overload.log`

Manual overload (maintenance):

```bash
sudo touch /var/run/allone-garden-overload   # site shows 503
sudo rm -f /var/run/allone-garden-overload   # back online
```

### Cloudflare (strongly recommended — protects router)

Put **allone.garden** behind [Cloudflare](https://dash.cloudflare.com) so traffic is filtered **before** your home IP.

1. Add domain → change nameservers at **TransIP** to Cloudflare’s.
2. DNS records `@`, `www`, `api` → **Proxied** (orange cloud) → your home WAN IP.
3. **SSL/TLS** → **Full (strict)** (Let’s Encrypt on Pi stays).
4. **Security** → Bot Fight Mode: On; Security Level: Medium.
5. **Caching** → cache static assets (`*.js`, `*.css`) — less load on Pi/router.

Optional: **Rate limiting** rule on `/api/auth/*` in Cloudflare dashboard.

With Cloudflare proxied, most bots/scans never hit your ASUS/ZyXEL.

### Router: keep home network alive

| Setting | Why |
|---------|-----|
| **QoS / bandwidth limit on Pi IP** | Cap e.g. 20–50 Mbps to server — Netflix/Wi‑Fi keep bandwidth |
| **UPnP off** | No surprise open ports |
| **Only forward 80 + 443** to Pi (or to inner router) | Minimal attack surface |
| **Server on Ethernet, Wi‑Fi off on Pi** | Stable IP, less radio contention |
| **Static DHCP** for Pi MAC | Port forwards keep working after reboot |
| **Guest VLAN / separate SSID** (if router supports) | Optional extra isolation |

If you have **two routers** (modem/ZyXEL → ASUS): forward **both layers** (WAN → ASUS → Pi).

### Monitoring

```bash
# Overload guard
sudo tail -f /var/log/allone-garden-overload.log

# Top visitors
sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

# HTTPS connections
ss -Htn state established '( sport = :443 )' | wc -l
```

