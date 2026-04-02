# Product roadmap

Planned work and status. Completed items stay here briefly for reference; releases: see `RELEASE_READY_CHECKLIST.md`.

## Done (code)

| Topic | What exists |
|-------|-------------|
| **Gradendex** | Bundles `en`, `nl`, `de`, `fr`, `es`, `pt`; entries for those languages (except `en`) also in overrides where applicable; `ru`–`uk` via `gradendex:extra`. CI (lint + frontend build) keeps `gradendex.*.json` in sync. Scripts: `gradendex-localize-fr-es-pt.js`, `gradendex-bundle-remaining.js`, `gradendex-merge-entry-overrides.js`. |
| **Core UI i18n** | 18 languages in `locales/*.json`; marketplace strings via `marketplace.*` keys (English fallback). |
| **Plugin marketplace UI** | `PluginMarketplace.js` with tabs, registry fallback, admin install/unload; backend `GET/POST /api/plugins/…`. |
| **Push** | Same as above + optional **APNs** (`APNS_*`), logging (`push_broadcast_log`), client analytics (`POST /api/push/analytics`), admin `GET /api/admin/push/logs` + **Admin Panel → Push** tab, scheduled broadcast (`PUSH_SCHEDULE_*`). See `PRODUCTION_ENV_TEMPLATE.md`. |
| **Leaderboard** | Live: `?season=` + season filter in UI. **Archive:** `user_season_scores` on season change (garden save), `GET /api/leaderboard/history`, `/history/cycles`; UI Archive tab + year cycle. |
| **Offline / sync** | Optional queue + `ifUnmodifiedSince` / `serverUpdatedAt`; on 409 the user can choose (server vs local) via conflict modal; Capacitor Preferences mirror for native. See `REACT_APP_ENABLE_OFFLINE_QUEUE`. |
| **Native review process** | Guidelines: `docs/NATIVE_REVIEW.md`. |
| **Security** | Proxy/CORS, JWT HS256, plugin capabilities, body limits; tests e.g. `networkSecurity`, `plugins-security`, admin/push guards. |

## Open — product

| Item | Notes |
|------|--------|
| **Native review** | Finetuning by native speakers (`docs/NATIVE_REVIEW.md`). |
| **Gradendex copy** | `entries` via overrides for all extra languages including de/fr/es/pt; native copy review still useful where not done yet. |
| **Push — operations** | Production test FCM + APNs + scheduler; monitor `sent`/`failures` via admin Push tab. |
| **Offline mobile** | Optional: deeper SQLite/Storage sync beyond the current queue + preferences mirror. |

## Operational (not app code)

- Production host, TLS, secrets, Steam/Discord/App Store IDs.
- Monitoring, logging, backups.
