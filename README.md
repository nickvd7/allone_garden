# 🌱 AllOne Garden

[![CI](https://github.com/nickvd7/allone_garden/actions/workflows/ci.yml/badge.svg)](https://github.com/nickvd7/allone_garden/actions/workflows/ci.yml)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

**Open-source multiplayer gardening game — grow together, own your world.**

Run your own server on a Raspberry Pi, Mac, Windows PC, Linux box, or Android phone.
No central server. No subscriptions. Just community, plants, and good soil.

---

## Features

- **Multiplayer garden** — plant, water, fertilize, harvest, and visit other players' gardens in real time
- **Trade marketplace** — list crops, buy from other players, earn coins
- **Chat** — real-time in-game chat with XSS protection and persistence
- **Leaderboard** — top players by XP, coins, and plants grown
- **Plugin system** — extend the game with sandboxed community plugins
- **P2P federation** — opt-in federation with other servers via Hyperswarm DHT
- **PWA** — install directly to iOS / Android home screen, no app store needed
- **GDPR** — data export and account deletion built in
- **i18n** — 18 UI languages (see `packages/frontend/src/i18n/locales`); English default

---

## Quick start (local dev — no database needed)

```bash
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden
bash start.sh
```

Open **http://localhost:3000** — the backend runs in in-memory mode, no PostgreSQL required.

---

## Install on any device

| Platform | Command |
|---|---|
| 🫐 **Raspberry Pi / Linux** | `curl -fsSL https://raw.githubusercontent.com/nickvd7/allone_garden/main/install.sh \| sudo bash` |
| 🍎 **macOS** | `bash install-mac.sh` |
| 🪟 **Windows** | `.\start.ps1` (dev) or Docker for a persistent server |
| 🤖 **Android (Termux)** | `bash install-termux.sh` |
| 🐳 **Docker** | `cp .env.example .env && docker compose up -d` |

See [INSTALL.md](INSTALL.md) for full instructions and troubleshooting.

---

## Play on mobile (iOS & Android)

No app store needed — AllOne Garden is a **Progressive Web App**.

**iOS Safari:** Share → "Add to Home Screen"
**Android Chrome:** Menu → "Add to Home screen"

The game icon appears on your home screen and runs in full-screen mode.

---

## Player guide (how to play)

Clear **English + Dutch** instructions for the world map, controls, your garden, other players, and menus:

**[docs/PLAYERS_GUIDE.md](docs/PLAYERS_GUIDE.md)**

---

## Builder quick start (contribute / hack)

Clone, run, **MoSCoW** (Must = online↔offline Overvecht), and the student **test workflow** — **English + Dutch**. No database, Steam, or Discord required. Steam is off by default and out of scope for the student project; `npm run steam:disable` if you need to turn it off again.

**[docs/QUICK_START.md](docs/QUICK_START.md)**

---

## Architecture

```
allone_garden/
├── packages/
│   ├── backend/        Node.js + Express + Socket.IO (GPL-3.0)
│   │   ├── src/
│   │   │   ├── routes/     auth, garden, trade, account, admin, leaderboard, plugins
│   │   │   ├── socket/     chat, game
│   │   │   ├── middleware/ auth, security, validate, socketAuth
│   │   │   ├── plugins/    loader, sandbox (VM isolation), api
│   │   │   ├── services/   email (nodemailer)
│   │   │   └── p2p/        federation (Hyperswarm)
│   │   └── tests/          auth, garden, trade, account, admin (Jest + supertest)
│   └── frontend/       React 18 (MIT)
│       ├── src/
│       │   ├── components/ Garden, Chat, Trade, Leaderboard, Plugins, Account, ...
│       │   ├── hooks/      useApi, useNetwork
│       │   └── i18n/       locales (18 languages) + Gradendex JSON bundles
│       └── public/
│           ├── manifest.json
│           └── sw.js       (service worker — offline + PWA install)
├── plugins/community/  weather-forecast, achievements
├── landing/            Marketing landing page (standalone HTML)
├── install.sh          Universal installer (dispatches per platform)
├── install-mac.sh      macOS (Homebrew + pm2)
├── install-termux.sh   Android (Termux)
├── start.ps1 / .bat    Windows development starters
└── docker-compose.yml  Production Docker stack
```

---

## Configuration

Copy and edit `packages/backend/.env.example`:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Key settings:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (leave empty for in-memory mode) |
| `JWT_SECRET` | **Required** — long random string, keep secret |
| `REDIS_URL` | Optional Redis for pub-sub |
| `ADMIN_USERS` | Comma-separated usernames with admin access |
| `P2P_ENABLED` | `true` to join the Hyperswarm federation network |
| `SMTP_HOST` | SMTP server for password-reset emails (optional) |
| `GARDEN_DOMAIN` | Domain for automatic HTTPS via Let's Encrypt (Pi/Linux) |

---

## Development

```bash
# Install all dependencies
npm install
cd packages/backend  && npm install
cd packages/frontend && npm install

# Run tests (no database needed)
cd packages/backend && npm test

# Start backend (port 5000)
cd packages/backend && npm run dev

# Start frontend (port 3000)
cd packages/frontend && npm start
```

Tests run fully offline in in-memory mode — no PostgreSQL or Redis required.

### Local verification (CI parity)

From the **repository root**, these scripts bundle the same kinds of checks you get in CI (without secrets):

| Command | What it runs |
|--------|----------------|
| `npm run verify:quick` | Validates `docker-compose.yml` (needs Docker Compose if available), then runs tests for **core**, **backend**, **frontend** (CI mode + `--runInBand`), and **desktop**. |
| `npm run verify:local` | Compose, backend **lint** + tests (CI-style env), frontend **lint**, `gradendex:extra` + **git diff** on `packages/frontend/src/i18n/gradendex.*.json`, frontend **test** (CI + `--runInBand`) + **production build** (`REACT_APP_API_URL=http://localhost:5000`), then **core** and **desktop** tests. |
| `npm run validate:compose` | Only compose config (uses a dummy `JWT_SECRET` if unset). |
| `npm run test:frontend:ci` | Frontend Jest only: `CI=true`, non-watch, `--runInBand` (avoids flaky mocks across parallel workers). |

Root `npm test` still runs all package tests with the default frontend test runner (interactive when not in CI).

**Playwright E2E** (`e2e/`): `cd e2e && npm install && npx playwright install chromium`, then `CI=true npx playwright test`. Override ports if defaults are busy: `E2E_BACKEND_PORT` / `E2E_FRONTEND_PORT` (see [`e2e/playwright.config.js`](e2e/playwright.config.js) and [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md)).

**npm audit:** CI runs `npm audit --audit-level=high` in `packages/backend` and `packages/frontend` only. The repo root [`package.json`](package.json) defines **`overrides`** for transitive fixes (`tar`, `nth-check`, `postcss`, `serialize-javascript`, `@tootallnate/once`, `underscore`, and `webpack-dev-server@4.15.2` for Create React App compatibility). A plain `npm audit` without `--audit-level=high` may still list **moderate** dev-only findings (e.g. `webpack-dev-server`); upgrading that safely needs moving off `react-scripts` or a CRA patch.

**Not** included locally: full Playwright runs in every contributor setup, Trivy, Docker image build — see [GitHub Actions](.github/workflows/ci.yml).

---

## Release QA (Localization)

Quick i18n QA pass before release:

- Switch through every language in the in-app selector and verify Header labels (`More`, `World`, dropdown items, logout) show translated text (no raw i18n keys).
- Check one desktop and one mobile viewport for each script family:
  - Latin (`en`/`nl`)
  - Cyrillic (`ru`/`uk`)
  - CJK (`ja`/`ko`/`zh`)
  - RTL (`ar`)
- In Header + `More` dropdown, verify no clipped text, no badge overlap, and no horizontal scroll.
- In Arabic, verify RTL menu behavior (dropdown anchoring, text alignment, badge position).
- Run a fallback guard to catch accidental English labels outside `en.json`:

```bash
rg "\"header_more\": \"More\"" packages/frontend/src/i18n/locales
rg "\"header_world_map_title\": \"World Map - visit other players\"" packages/frontend/src/i18n/locales
```

For full pre-release checks, see [RELEASE_READY_CHECKLIST.md](RELEASE_READY_CHECKLIST.md).

---

## Contributing

Pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

- **Backend** (`packages/backend`): [GPL-3.0](packages/backend/LICENSE)
- **Frontend** (`packages/frontend`): [MIT](packages/frontend/LICENSE)
- **Plugins** (`plugins/community`): MIT

---

*Thank you for hosting AllOne Garden. 🌍*
