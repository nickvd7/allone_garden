# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- i18n: `auth.*`, `videoCall.*`, `worldMap.*` fully translated in `packages/frontend/src/i18n/locales/*.json`
- `api.patch()` helper in frontend `useApi.js`
- Gradendex: **fr** / **es** / **pt** bundles in `i18n/config.js`; `gradendex-localize-fr-es-pt.js` writes `gradendex.{fr,es,pt}.json` (UI + entries from `gradendex-entries-overrides/`)
- Gradendex: **ru**, **it**, **pl**, **tr**, **ja**, **ko**, **zh**, **ar**, **hi**, **id**, **vi**, **uk** bundles via `npm run gradendex:extra` (`gradendex-bundle-remaining.js` + merge overrides)
- Leaderboard: optional `?season=` query (spring/summer/autumn/winter) and UI season filters (MVP)
- Offline: optional garden action queue (`REACT_APP_ENABLE_OFFLINE_QUEUE`) via `useOfflineGardenQueue`; conflict modal + Capacitor Preferences mirror for native
- Push: FCM HTTP v1 / legacy, optional **APNs** (`APNS_*`), `POST /api/push/analytics`, `GET /api/admin/push/logs`, DB logging, scheduled broadcast (`PUSH_SCHEDULE_*`); admin **Push** tab shows broadcast log
- CI: **Docker Compose validate** job (`docker compose config`) on every push/PR
- i18n: `gardenConflict.*` in all UI locale files (not only `en`/`nl`)
- Gradendex: entry overrides in `scripts/gradendex-entries-overrides/` for **de, fr, es, pt, nl** plus **ru, it, pl, tr, ja, ko, zh, ar, hi, id, vi, uk** (single source for copy; `gradendex:extra` merges into `src/i18n`)
- Gradendex: Ukrainian copy fixes in `uk.json` (класика, компост, орані грядки, теплиця/посуха)
- CI: **Lint** and **Frontend build** jobs run `gradendex:extra` + `git diff` check on `gradendex.*.json`
- ESLint: relaxed rules for `__tests__`; remaining test imports cleaned up
- Tests: `GardenConflictModal.test.js`; AdminPanel tab style conflict (borderBottom) fixed

### Changed
- Frontend tests: `setupTests.js` uses real i18next (`i18n/config`) instead of a stub `t()` that returned keys; expectations in Header, Garden, ToolsPanel, GradendexView, PluginConfigurator, etc. updated for resolved English copy
- AuthScreen, VideoCall, WorldMap: hardcoded UI strings moved to `useTranslation` and the namespaces above
- Docs: Gradendex workflow in `SETUP_CHECKLIST.md` and `docs/NATIVE_REVIEW.md`; release checklist §7 (Gradendex) updated; redundant/outdated Gradendex bullets in this file cleaned up
- `CODE_OF_CONDUCT.md`: restored proper Contributor Covenant 2.1 text (removed stray license paste); `README.md` i18n/architecture lines updated for 18 languages + Gradendex bundles

---

## [1.0.0] — 2025-03-28

### Added

**Core gameplay**
- Garden with 24 plots: till, plant, water, fertilize, harvest, next-day
- Weather system (sunny / cloudy / rainy / windy) with per-day progression
- XP, coins, level, and plants-grown player stats
- Auto-save garden to backend (debounced, 3 s after last change)
- In-memory fallback — runs fully offline without PostgreSQL

**Multiplayer & social**
- Real-time multiplayer via Socket.IO
- Chat with XSS protection and persistence (DB insert after broadcast)
- Garden visits: players can visit each other and earn XP by helping
- Player list panel showing online users

**Trade marketplace**
- List crops for sale, buy from other players, earn coins
- Trade modal with inventory and coin management

**Authentication**
- Register / login with bcrypt (cost 12) + JWT (7-day expiry)
- `isAdmin` flag in user response (covers `ADMIN_USERS` env var and `level >= 99`)
- Password reset flow: `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`
  - Single-use token, 1-hour TTL
  - Token exposed in response body in dev/in-memory mode (no SMTP needed for testing)
- Constant-time password comparison to prevent timing attacks
- Rate limiting on all auth endpoints (`authLimiter`: 10 req / 15 min)

**Email service**
- Nodemailer wrapper (`src/services/email.js`) — lazy-loaded, only when `SMTP_HOST` is set
- HTML + plain-text password reset email
- Falls back to stdout when no SMTP configured

**GDPR / account**
- `PATCH /api/account/password` — change password (requires current password)
- `GET /api/account/export` — download full account data as JSON
- `DELETE /api/account` — delete account + all data (requires password confirmation)
- Rate limited to 5 req / 15 min

**Admin panel**
- `GET /api/admin/stats` — server uptime, memory, CPU, plugin list, DB counts
- `GET /api/admin/players` — full player table
- `GET /api/admin/plugins` — loaded plugins
- `POST /api/admin/plugins/:name/reload` — hot-unload a plugin
- `GET /api/admin/peers` — known federation peers
- Admin access via `ADMIN_USERS` env var or `level >= 99` in DB

**Plugin system**
- VM-sandboxed plugin loader (`vm` module, no `require`, no `process`)
- Plugin API: `api.on`, `api.broadcast`, `api.sendTo`, `api.dbQuery`, `api.dbCreateTable`, `api.emit`, `api.log`
- Plugin DB tables prefixed `plugin_{name}_{table}` — no access to core tables
- Hot-unload with event listener cleanup
- Plugin routes: `GET /api/plugins`, `GET /api/plugins/registry`, `POST /api/plugins/:name/install`, `POST /api/plugins/:name/unload`
- Install validates SHA-256 checksum when registry entry includes one
- Bundled catalogue served from backend when `PLUGIN_REGISTRY_URL` is not set

**Community plugins**
- `achievements` — 19 unlockable badges (planting, harvesting, watering, trading, social, survival, coins, variety)
- `weather-forecast` — 5-day forecast generated each in-game day, broadcast to all clients

**PWA / mobile**
- `manifest.json` with icons (192 + 512 px), shortcuts, screenshots
- Service worker (`sw.js`): cache-first for app shell, network-only for `/api/` and `/socket.io/`
- `serviceWorkerRegistration.js` with update event dispatch
- iOS meta tags (`apple-mobile-web-app-capable`, status bar, splash screens)
- Open Graph tags

**Leaderboard**
- Top players by XP, coins, and plants grown
- In-memory leaderboard updated on every login / register / game action

**P2P federation**
- Opt-in Hyperswarm DHT federation (`P2P_ENABLED=true`)
- Cross-server chat with 🌍 badge
- Known peers persisted in DB (`known_peers` table)

**i18n**
- English and Dutch translations via i18next

**Multi-platform install**
- `install.sh` — Raspberry Pi / Linux (Node 20, PostgreSQL, Nginx, Let's Encrypt)
- `install-mac.sh` — macOS via Homebrew + pm2
- `install-termux.sh` — Android (Termux / F-Droid)
- `start.ps1` / `start.bat` — Windows dev starters
- `docker-compose.yml` — production Docker stack with PostgreSQL + Redis

**CI/CD**
- GitHub Actions: Backend (Node 20 + 22), Frontend build, Docker build check
- All tests run in in-memory mode — no external services needed

**Tests** (67 passing, fully offline)
- `auth.test.js` — register, login, /me, password reset, token expiry
- `garden.test.js` — all garden actions, validation, persistence
- `trade.test.js` — list, buy, validate, auth guards
- `account.test.js` — password change, export, delete, rate limits
- `admin.test.js` — stats, players, plugins, peers, auth guards

### Fixed
- Login looked up by email instead of username — changed `validateLogin` to accept `username`
- `npm ci` in CI workflow and Dockerfiles replaced with `npm install` (no sub-package lockfiles committed)
- `cache-dependency-path` in CI pointed to non-existent lockfiles — fixed to use root `package-lock.json`

---

[Unreleased]: https://github.com/nickvd7/allone_garden/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nickvd7/allone_garden/releases/tag/v1.0.0
