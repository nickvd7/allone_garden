# Release ready checklist

Use this checklist right before a release. Items are grouped so you can see gaps quickly. For environment variables per layer, see `PRODUCTION_ENV_TEMPLATE.md`. For security operations (proxy, CORS, WebRTC, logging), see `SECURITY_HARDENING.md`.

## 1) Core setup

- [x] `npm ci` runs clean in root and workspaces (verified; rerun before each release)
- [x] Frontend build passes (`packages/frontend`) — ESLint production build
- [x] Backend tests green (`packages/backend`)
- [x] Frontend tests green (`packages/frontend`)
- [x] `docker-compose.yml` syntactically validated in **CI** (`docker compose config` in `.github/workflows/ci.yml`); locally: `npm run validate:compose` (requires Docker CLI)

## 2) Secrets and env

- [ ] Production `.env` filled for backend (`JWT_SECRET`, DB, Redis, SMTP)
- [ ] Steam: leave `STEAM_APP_ID=0` / `steam_appid.txt` as `0` unless you ship on Steam (`npm run steam:disable`). If you do ship on Steam, set a real App ID (see `SETUP_CHECKLIST.md`)
- [ ] `DISCORD_APP_ID` set (optional)
- [ ] GitHub Actions secrets for mobile/iOS reviewed

## 3) Mobile (Capacitor)

- [x] Native projects exist:
  - `packages/frontend/android`
  - `packages/frontend/ios`
- [ ] Android build artifact verified via `mobile-build.yml` workflow
- [ ] iOS workflow runs (only when Apple secrets are set)
- [ ] iOS signing/provisioning validated on Apple account

## 4) Desktop (Electron)

- [ ] Auto-update endpoint available with valid `latest.yml`
- [ ] Release channel chosen (GitHub Releases recommended)
- [ ] Installer smoke test on target platform(s)

## 5) Deployment / operations

- [ ] Production server chosen and configured (VPS/Render/Railway)
- [ ] Reverse proxy + TLS/HTTPS active
- [ ] Logging/monitoring in place
- [ ] Backups for database and critical state tested

## 6) Functional regression

- [ ] Login/registration flow OK
- [ ] Multiplayer/socket connection OK
- [ ] Marketplace/trade flow OK
- [ ] Leaderboard endpoints and UI OK
- [ ] Admin panel core actions OK (incl. Push tab with DB for broadcast log)
- [ ] Mobile basic flow (start, navigation, sync) OK

## 7) Localization

- [x] Available: `en`, `nl`, `de`, `fr`, `es`, `pt`, `ru`, `it`, `pl`, `tr`, `ja`, `ko`, `zh`, `ar`, `hi`, `id`, `vi`, `uk` (core UI translated; brand name `AllOne Garden` where applicable)
- [x] Auth screen, VideoCall, World Map: keys `auth.*`, `videoCall.*`, `worldMap.*` in `packages/frontend/src/i18n/locales/*.json`
- [x] Gradendex: bundles for all UI languages; entries via `scripts/gradendex-entries-overrides/` + `npm run gradendex:extra` (CI checks drift on `gradendex.*.json`)
- [x] Plugin marketplace: translatable keys (`marketplace.*`) with English defaults
- [x] Header i18n parity: `header_*` keys present in all locale files (`packages/frontend/src/i18n/locales/*.json`)
- [ ] Copy quality pass per release language (native review)
- [ ] Plan future languages if needed (e.g. `th`, `ms`, `ro`)

### Localization QA pass (quick runbook)

Use this mini-pass before tagging a release:

- [ ] **Language sweep:** switch through every language in the in-app selector and verify header labels (`More`, `World`, dropdown items, logout) render as translated text (no raw i18n keys).
- [ ] **Layout sanity:** check one desktop viewport and one mobile viewport for each script family:
  - Latin (`en`/`nl`)
  - Cyrillic (`ru`/`uk`)
  - CJK (`ja`/`ko`/`zh`)
  - RTL (`ar`)
- [ ] **Overflow/truncation:** in Header and `More` dropdown, confirm no clipped text, no overlapping badge, and no horizontal scroll.
- [ ] **RTL behavior:** in Arabic, verify menu alignment flips correctly (dropdown anchoring, text alignment, badge position).
- [ ] **Fallback guard:** grep once before release to ensure no accidental English fallback labels remain outside `en.json`:
  - `rg "\"header_more\": \"More\"" packages/frontend/src/i18n/locales`
  - `rg "\"header_world_map_title\": \"World Map - visit other players\"" packages/frontend/src/i18n/locales`

## 8) Release-day command list (copy/paste)

Run from repo root unless noted.

### A) Core verification

```bash
npm run verify:quick
```

If you want the full local parity sweep:

```bash
npm run verify:local
```

### B) Frontend production build

```bash
cd packages/frontend && REACT_APP_API_URL=http://localhost:5000 npm run build
```

### C) Playwright smoke (stable ports)

```bash
cd e2e
npm install
npx playwright install chromium
E2E_BACKEND_PORT=15621 E2E_FRONTEND_PORT=15622 npx playwright test tests/smoke.spec.js --reporter=list
```

Optional auth flow regression:

```bash
cd e2e && E2E_BACKEND_PORT=15631 E2E_FRONTEND_PORT=15632 npx playwright test tests/auth.spec.js --reporter=list
```

### D) Localization guardrails

```bash
rg "\"header_more\": \"More\"" packages/frontend/src/i18n/locales
rg "\"header_world_map_title\": \"World Map - visit other players\"" packages/frontend/src/i18n/locales
```

Expected result: only `en.json` should match the first command; the second command should return no matches.

### E) Final git sanity check (before tag/release)

```bash
git status
git diff --stat
```
