# Production environment: variables by layer

Use this as a reference when deploying. Values are examples; replace with your production URLs and secrets. **Do not commit real secrets.** See also `packages/backend/.env.example`, `packages/desktop/.env.example`, and for security operations: `SECURITY_HARDENING.md`.

---

## 1) Docker Compose (repo root)

When running `docker compose up`, Compose often reads a `.env` in the **repo root** (next to `docker-compose.yml`). Typical variables:

| Variable | Role |
|----------|------|
| `POSTGRES_PASSWORD` | Password for Postgres (`garden` user). |
| `JWT_SECRET` | **Required in production.** Long random secret. |
| `FRONTEND_URL` | Public origin(s) of the web app (CORS + Socket.IO). Multiple values: **comma-separated**. |
| `TRUST_PROXY` | Number of proxy hops for `X-Forwarded-*` (rate limit / audit IP). Docker default in compose: `1`. |
| `PLUGIN_STRICT_CAPABILITIES` | `true` (default in compose): plugins without `capabilities` are rejected. |
| `FRONTEND_API_URL` | Build arg for frontend: base API URL (`REACT_APP_API_URL`). |
| `SERVER_NAME` | Visible server name in the UI. |
| `SERVER_MOTD` | Optional MOTD. |
| `P2P_ENABLED` | `true` / `false` — federation. |
| `ADMIN_USERS` | Comma-separated admin usernames. |
| `SMTP_*`, `APP_URL` | See backend section. |
| `PLUGIN_REGISTRY_URL` | Optional: community plugin registry. |
| `WEBRTC_STUN_SERVERS` | Comma-separated STUN URLs. |
| `WEBRTC_TURN_URL` | Optional TURN (video). |
| `WEBRTC_TURN_USERNAME` / `WEBRTC_TURN_PASSWORD` | TURN credentials. |

See `docker-compose.yml` for exact mapping to services.

---

## 2) Backend (`packages/backend`)

Copy `packages/backend/.env.example` to `.env` on the server and fill in.

### Required in production

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Generate e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DATABASE_URL` | Postgres connection string (or empty only for dev/in-memory). |
| `FRONTEND_URL` | One or more exact origins (including `https://`), comma-separated for multiple frontends. |
| `TRUST_PROXY` | Set behind reverse proxy (often `1`). See `SECURITY_HARDENING.md`. |
| `PLUGIN_STRICT_CAPABILITIES` | Optional `true` to enforce strict plugin manifests (production also enforces without this var). |

### Often needed

| Variable | Notes |
|----------|--------|
| `PORT` | Default `5000`. |
| `REDIS_URL` | For rate limiting / pub-sub: `redis://…` |
| `JWT_EXPIRES_IN` | Default `7d`. |
| `ADMIN_USERS` | Admin without DB level 99. |
| `SERVER_NAME`, `SERVER_MOTD` | Server identity. |

### Email (SendGrid aanbevolen)

| Variable | Notes |
|----------|--------|
| `SENDGRID_API_KEY` | SendGrid API key (aanbevolen voor productie). |
| `SENDGRID_FROM` | Geverifieerd afzenderadres (bijv. `noreply@jouwdomein.nl`). |
| `SMTP_HOST` | Fallback zonder SendGrid; leeg = mail naar stdout/logs. |
| `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Generieke SMTP (ook `smtp.sendgrid.net` mogelijk). |
| `APP_URL` | Basis-URL voor links in e-mails (fallback: `FRONTEND_URL`). |
| `SETUP_ADMIN_SECRET` | **Verplicht** voor eerste admin-setup. Lang willekeurig geheim (`openssl rand -hex 32`). Dezelfde waarde invullen op het setup-formulier bij eerste login. |

### Other

| Variable | Notes |
|----------|--------|
| `P2P_ENABLED` | `true` for Hyperswarm federation. |
| `PLUGIN_REGISTRY_URL` | Marketplace browsing. |
| `SQLITE_PATH` | Electron/offline desktop only; empty on normal server. |
| `WEBRTC_STUN_SERVERS` | Comma-separated. |
| `WEBRTC_TURN_URL` / `WEBRTC_TURN_USERNAME` / `WEBRTC_TURN_PASSWORD` | TURN for WebRTC. |
| `ELECTRON_MODE` | Set by Electron; do not set manually on production unless you know why. |
| `FCM_SERVICE_ACCOUNT_JSON` / `FCM_SERVICE_ACCOUNT_PATH` | Firebase service account for **FCM HTTP v1** (admin push). Alternative: `FCM_SERVER_KEY` (legacy). |
| `FCM_PROJECT_ID` | Optional if not inferred from service account JSON. |
| `PUSH_USE_REDIS` | `true` to store push tokens in Redis. |
| `APNS_KEY_PATH` | Path to Apple **.p8** key (HTTP/2 APNs) for iOS tokens with `transport: apns`. |
| `APNS_KEY_ID` | Key ID from Apple Developer (for the .p8). |
| `APNS_TEAM_ID` | Apple Team ID. |
| `APNS_BUNDLE_ID` | iOS app bundle ID (must match certificate/provisioning). |
| `APNS_PRODUCTION` | `true` for App Store / production APNs; `false` for sandbox. |
| `PUSH_SCHEDULE_CRON` | Optional: cron expression (node-cron) for scheduled broadcast (same payload as admin notify). |
| `PUSH_SCHEDULE_TITLE` | Title for scheduled push (required if cron is set). |
| `PUSH_SCHEDULE_BODY` | Body for scheduled push. |

See also `GET /api/admin/push/logs` (admin only) and `POST /api/push/analytics` (client events). Push tables: run `npm run db:push` in `packages/backend` after DB migration if applicable.

---

## 3) Frontend (build-time)

Create React App only reads variables starting with `REACT_APP_` **during `npm run build`**.

| Variable | Role |
|----------|------|
| `REACT_APP_API_URL` | Base URL of the backend API (e.g. `https://api.example.com` or empty for relative URLs on same host). |
| `REACT_APP_SERVER_NAME` | Fallback server name in the UI. |
| `REACT_APP_ENABLE_PUSH` | Set to `true` to enable push registration + token to `POST /api/push/register` on native (iOS/Android). |
| `REACT_APP_PUSH_TRANSPORT` | Optional: `fcm` (default) or `apns` — must match how tokens reach the server (Android/FCM vs native iOS with APNs backend). |
| `REACT_APP_ENABLE_OFFLINE_QUEUE` | `true` — queue garden saves offline and sync on reconnect (with server conflict check via `ifUnmodifiedSince`). |
| `CI` | In CI sometimes `CI=false` so warnings do not fail the build. |

**Docker:** `docker-compose.yml` passes build args `REACT_APP_API_URL` and `REACT_APP_SERVER_NAME`.

**Capacitor / mobile:** same build; often empty `REACT_APP_API_URL` when API is on the same domain.

**Pi / bare-metal:** `packages/frontend/.env.production` in the repo is loaded automatically on `npm run build` during `update.sh` / `install.sh`. Backend defaults to merge via `packages/backend/env.production.defaults` + `scripts/merge-production-env.sh` (runs on deploy/update; never overwrites existing keys).

---

## 4) Desktop (Electron)

File: `packages/desktop/.env.example` (copy to `.env` locally or set in release CI).

| Variable | Role |
|----------|------|
| `STEAM_APP_ID` | Steamworks App ID; `0` = Steam off (default). Alternative: `packages/desktop/steam_appid.txt`. Force off: `npm run steam:disable`. See [docs/QUICK_START.md](docs/QUICK_START.md). |
| `DISCORD_APP_ID` | Discord Rich Presence; `0` = off. |

Auto-update (`electron-updater`): configure publish in `packages/desktop` (GitHub Releases is common); endpoint must serve `latest.yml` over HTTPS.

---

## 5) GitHub Actions

### CI (`.github/workflows/ci.yml`)

- **Docker Compose validate:** job `compose` runs `docker compose config` — catches syntax/merge errors in `docker-compose.yml` before deploy.

### Mobile (`mobile-build.yml`)

- **Android (release signing, optional):** `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- **iOS:** `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ISSUER_ID`, `APPLE_API_KEY_ID`, `APPLE_API_PRIVATE_KEY` (workflow builds iOS only when these are set)

### Desktop / releases

- `GITHUB_TOKEN` is used by workflows where needed (releases/artifacts).

### Steam deploy (optional)

- Only if you publish on Steam. Otherwise skip; `npm run steam:disable` keeps App ID at `0`.
- Check `steam-deploy.yml` for any SteamCMD or depot secrets you add.

---

## 6) Quick checklist before go-live

- [ ] `JWT_SECRET` strong and unique
- [ ] `FRONTEND_URL` and `APP_URL` correct with HTTPS
- [ ] `DATABASE_URL` and `REDIS_URL` reachable from backend container/host
- [ ] Frontend build with correct `REACT_APP_API_URL` for your routing
- [ ] SMTP filled in if players need email reset
- [ ] TURN filled in if video must work over strict NAT
- [ ] Push: FCM service account or legacy key; for direct iOS: `APNS_*`; optional `PUSH_SCHEDULE_*` and `REACT_APP_PUSH_TRANSPORT` in frontend build
