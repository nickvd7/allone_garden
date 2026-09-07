# AllOne Garden — Builder quick start / Snelstartgids voor bouwers

This page is available in **English** first, then **Dutch (Nederlands)** — same structure in both languages.

Written for **student teams** who continue AllOne Garden (see the Software Project Plan). Steam, Discord, PostgreSQL, Redis, and app-store signing are **not required** to start. Steam is **off by default** and **out of scope** for the student project (Won’t).

For playing the game: [PLAYERS_GUIDE.md](PLAYERS_GUIDE.md).  
For hosting a public/LAN server: [INSTALL.md](../INSTALL.md).  
For contributing rules (commits, PRs): [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## English

### What you need

| Tool | Notes |
|------|--------|
| **Node.js 18+** | 20 LTS recommended — [nodejs.org](https://nodejs.org) |
| **Git** | Clone and pull |
| **A browser** | Chrome, Firefox, Safari, or Edge |

You do **not** need PostgreSQL, Redis, a Steamworks account, Discord, Docker, or a Raspberry Pi for day one.

### 1. Clone and run

```bash
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden
bash start.sh
```

Open **http://localhost:3000**. Play as Guest or register (accounts live in memory until you add a database).

**Windows:** `.\start.ps1` (PowerShell) or `start.bat` (Command Prompt).

`start.sh` installs npm packages on first run, copies `packages/backend/.env.example` → `.env`, and picks a free port if 3000 or 5000 is busy.

Leave `DATABASE_URL` empty for **in-memory mode**. Data is lost on restart; that is expected.

Harmless log line: `[redis] Connection error (falling back to in-memory)` — Redis is optional.

**Headless / VM browsers:** pixi.js/WebGL can crash Chrome. Force the DOM map:

```bash
REACT_APP_PIXI_MAP=off bash start.sh
```

### 2. Where the code lives

This is an npm **workspaces** monorepo (`packages/*`). Stay in these packages (Won’t: no extra repo split).

| Path | What it is | Typical first edit |
|------|------------|--------------------|
| `packages/core` | Pure game rules (plants, growth, weather, companions) — no server | `src/plants.js`, `src/weather.js`, `src/growth.js` |
| `packages/backend` | Node, Express, Socket.IO — API, auth, garden save, chat, plugins | `src/routes/`, `src/socket/` |
| `packages/frontend` | React (Create React App) UI | `src/components/`, `src/hooks/`, `src/i18n/locales/` |
| `packages/desktop` | Optional Electron wrapper | Skip (Steam / App Store are Won’t) |
| `plugins/community/` | Sandboxed community plugins | Copy an existing plugin folder |
| `e2e/` | Playwright browser flows | Add a spec when you ship a user-visible flow |

Default ports: frontend **3000**, backend **5000**. Health check: `http://localhost:5000/health`.

### 3. MoSCoW (what to build)

Must is the project core: **online ↔ offline with the physical garden in Overvecht**. Should / Could are invitations. Won’t is out of scope.

| Prio | # | Feature | Start here in the repo |
|------|---|---------|------------------------|
| **Must** | 1 | Online↔offline link with the physical garden | Offline queue (flag `REACT_APP_ENABLE_OFFLINE_QUEUE`): `packages/frontend/src/hooks/useOfflineGardenQueue.js`, conflict UI `GardenConflictModal.js` + test `GardenConflictModal.test.js`. Server concurrency: `ifUnmodifiedSince` in `packages/backend/src/routes/garden.js`. Physical check-in already has a seed: QR `packages/backend/src/routes/qr.js`, UI `QRPanel.js`, tests `qr.test.js` / `QRPanel.test.js`. Payload: `allonegarden:plant:<slug>`. |
| **Must** | 2 | New art for that connection | 2D only, readable on a small phone. Offline/sync/check-in/reward icons and tiles in the existing frontend style (`packages/frontend/src/components/`, `packages/frontend/public/`). Do **not** rebuild Pixi/DOM map engines. |
| **Must** | 3 | One working end-to-end connection flow | One chain: **physical action → app → visible impact in the game**, documented and covered by tests (Jest + a Playwright spec under `e2e/tests/`). Extend QR, offline queue, or a new Overvecht code — do not start a second platform. |
| **Should** | 4 | Sharpen season & weather | `packages/core/src/weather.js`, `growth.js`; UI `SeasonBanner.js`; tests `packages/core/tests/`, `packages/backend/tests/season.test.js`. Improve the **current** system; do not write a new weather engine. |
| **Should** | 5 | Clearer goals / quests | Tie existing goals to garden actions. Plugin `plugins/community/achievements/`; UI `AchievementsPanel.js`. Extend, don’t replace. |
| **Should** | 6 | Stronger help / trade | `packages/backend/src/routes/trade.js`, `src/socket/`; UI `TradeModal.js`; tests `trade.test.js`, `e2e/tests/marketplace.spec.js`. |
| **Should** | 7 | Clearer progression | Leaderboard season filter already exists (`?season=`). UI `Leaderboard.js`, `AchievementsPanel.js`; backend `routes/leaderboard.js`. |
| **Could** | 8 | New community plugin(s) | Copy a folder under `plugins/community/`. Export `{ name, version, init(api) }` from `index.js`. `name` = folder (`kebab-case`). |
| **Could** | 9 | Extend existing plugins | `weather-forecast`, `achievements`, `seasons`, `daily-bonus`, `crop-prices`, … |
| **Could** | 10 | Plugin marketplace / install flow | UI `PluginMarketplace.js`, `PluginConfigurator.js`; API `packages/backend/src/routes/plugins.js`. |

**Won’t (do not spend the project on this)**

| # | Out of scope |
|---|----------------|
| 11 | No rewrite of the game engine or world-map renderer (Pixi/DOM). Optimise only. |
| 12 | No required central cloud or app-store release. Self-hosting (Pi) stays the model. **Steam / App Store / Play Store are out of scope.** |
| 13 | No full WCAG AA/AAA audit of every screen. Do apply a11y where the connection flow needs it. |
| 14 | P2P / Hyperswarm federation is not the success metric (small experiment at most). |
| 15 | No extra platform or monorepo split. Work in `frontend` / `backend` / `core` / `plugins`. |

Steam is already **off** (`packages/desktop/steam_appid.txt` = `0`). To force it off: `npm run steam:disable`. Skip GitHub secrets `STEAM_*` and ignore `.github/workflows/steam-deploy.yml`.

### 4. Tests (required for student work)

The plan’s workflow: **run locally → change the right package → unit tests → `verify:quick` → Playwright for the user flow → PR with design choices and test results.**

Most tests run **in-memory** (no Postgres/Redis). In-memory is for speed; data disappears on restart. If your feature **must persist**, also try a real `DATABASE_URL` before you call it done (local Postgres, then `cd packages/backend && npm run db:migrate`). Full Docker Compose is production-like ([INSTALL.md](../INSTALL.md)); day-to-day work stays on `bash start.sh`.

**Unit / package tests** (from repo root unless noted):

```bash
# Shared game rules
cd packages/core && npm test

# API, garden, trade, plugins, security (in-memory)
cd packages/backend && npm test

# UI (non-watch — plain `npm test` in the frontend package hangs)
npm run test:frontend:ci

# One file while you iterate
cd packages/backend && npx jest tests/qr.test.js
cd packages/frontend && CI=true npx react-scripts test --watchAll=false --runInBand src/__tests__/QRPanel.test.js
```

**Whole baseline** (core + backend + frontend CI + desktop):

```bash
npm run verify:quick
```

Closer to CI (lint, Gradendex sync, production frontend build): `npm run verify:local`. See [README.md](../README.md#local-verification-ci-parity).

**Playwright E2E** (Must #3 and any player-visible flow). Specs assert **English** UI (`garden_lang=en`):

```bash
cd e2e
npm install
npx playwright install chromium
CI=true npx playwright test
```

Smoke only: `cd e2e && npm run test:smoke`.

If port **5000** is busy (common on macOS AirPlay):

```bash
cd e2e && E2E_BACKEND_PORT=5001 E2E_FRONTEND_PORT=3001 CI=true npx playwright test
```

Add a spec next to `e2e/tests/garden.spec.js` / `smoke.spec.js` when you ship the Overvecht connection chain.

**PR test bar:** tick `npm run verify:quick` on the [PR template](../.github/PULL_REQUEST_TEMPLATE.md), name the tests you ran, and describe conflict behaviour (local vs server) if you touch sync.

### 5. First week (suggested)

1. `bash start.sh` — guest + register; till / plant / water on the plot you stand on (tool buttons, not map tiles).
2. Skim Must #1 files (offline queue, garden `409`, QR).
3. Pick **one** slice of Must #3 (e.g. scan a plot QR → reward in-game) and write the failing test first.
4. Keep Should/Could for later sprints unless a Must slice is already demoable.

### 6. Small examples (optional)

**Add a plant** — `packages/core/src/plants.js` + `packages/core/tests/`.  
**UI copy** — `packages/frontend/src/i18n/locales/` (`en.json` and `nl.json` first). No hardcoded English in JSX.  
**API** — `packages/backend/src/routes/` + a file under `packages/backend/tests/`.

### 7. Send a pull request

1. Fork and branch (`feature/…`, `fix/…`, or `docs/…`).
2. [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …).
3. Tests for new behaviour (Jest and, for Must #3, Playwright).
4. Update `CHANGELOG.md` under `[Unreleased]`.
5. PR against `main`: what you changed, **why** (MoSCoW #), design choices, test commands + results.

More detail: [CONTRIBUTING.md](../CONTRIBUTING.md).

### 8. Extra (only when you need it)

| Goal | Doc |
|------|-----|
| Production install (Pi, Docker, macOS, Termux) | [INSTALL.md](../INSTALL.md) |
| Env vars for a real server | [PRODUCTION_ENV_TEMPLATE.md](../PRODUCTION_ENV_TEMPLATE.md) |
| Store signing / Discord / Steam (not the student Must) | [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md) |
| How to play | [PLAYERS_GUIDE.md](PLAYERS_GUIDE.md) |

---

## Nederlands

### Wat je nodig hebt

| Tool | Opmerkingen |
|------|-------------|
| **Node.js 18+** | 20 LTS aanbevolen — [nodejs.org](https://nodejs.org) |
| **Git** | Clonen en pullen |
| **Een browser** | Chrome, Firefox, Safari of Edge |

Je hebt **geen** PostgreSQL, Redis, Steamworks-account, Discord, Docker of Raspberry Pi nodig voor dag één.

### 1. Clonen en starten

```bash
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden
bash start.sh
```

Open **http://localhost:3000**. Speel als gast of registreer (accounts staan in het geheugen tot je een database toevoegt).

**Windows:** `.\start.ps1` (PowerShell) of `start.bat` (Opdrachtprompt).

`start.sh` installeert npm-pakketten bij de eerste run, kopieert `packages/backend/.env.example` → `.env`, en kiest een vrije poort als 3000 of 5000 bezet is.

Laat `DATABASE_URL` leeg voor **in-memory-modus**. Data verdwijnt bij herstart; dat is de bedoeling.

Onschadelijke logregel: `[redis] Connection error (falling back to in-memory)` — Redis is optioneel.

**Headless / VM-browsers:** pixi.js/WebGL kan Chrome laten crashen. Forceer de DOM-kaart:

```bash
REACT_APP_PIXI_MAP=off bash start.sh
```

### 2. Waar de code staat

Dit is een npm **workspaces**-monorepo (`packages/*`). Blijf in deze packages (Won’t: geen extra repo-split).

| Pad | Wat het is | Typische eerste wijziging |
|-----|------------|---------------------------|
| `packages/core` | Pure spelregels (planten, groei, weer, buren) — geen server | `src/plants.js`, `src/weather.js`, `src/growth.js` |
| `packages/backend` | Node, Express, Socket.IO — API, auth, tuin opslaan, chat, plugins | `src/routes/`, `src/socket/` |
| `packages/frontend` | React (Create React App) UI | `src/components/`, `src/hooks/`, `src/i18n/locales/` |
| `packages/desktop` | Optionele Electron-wrapper | Overslaan (Steam / App Store zijn Won’t) |
| `plugins/community/` | Plugins in een sandbox | Kopieer een bestaande plugin-map |
| `e2e/` | Playwright-browserflows | Voeg een spec toe bij een zichtbare gebruikersflow |

Standaardpoorten: frontend **3000**, backend **5000**. Health check: `http://localhost:5000/health`.

### 3. MoSCoW (waar je aan bouwt)

Must is de projectkern: **online ↔ offline met de fysieke moestuin in Overvecht**. Should / Could zijn uitnodigingen. Won’t valt buiten scope.

| Prio | # | Feature | Start hier in de repo |
|------|---|---------|------------------------|
| **Must** | 1 | Online↔offline-verbinding met de fysieke moestuin | Offline-wachtrij (flag `REACT_APP_ENABLE_OFFLINE_QUEUE`): `packages/frontend/src/hooks/useOfflineGardenQueue.js`, conflict-UI `GardenConflictModal.js` + test `GardenConflictModal.test.js`. Server-concurrency: `ifUnmodifiedSince` in `packages/backend/src/routes/garden.js`. Fysieke check-in heeft al een kiem: QR `packages/backend/src/routes/qr.js`, UI `QRPanel.js`, tests `qr.test.js` / `QRPanel.test.js`. Payload: `allonegarden:plant:<slug>`. |
| **Must** | 2 | Nieuwe art voor die verbinding | Alleen 2D, leesbaar op een kleine telefoon. Iconen/tiles voor offline/sync/check-in/beloning in de bestaande frontendstijl (`packages/frontend/src/components/`, `packages/frontend/public/`). **Niet** de Pixi/DOM-kaartengines herschrijven. |
| **Must** | 3 | Eén werkende end-to-end-verbindingsflow | Eén keten: **fysieke actie → app → zichtbaar effect in de game**, gedocumenteerd en afgedekt met tests (Jest + een Playwright-spec onder `e2e/tests/`). Bouw voort op QR, de offline-queue of een nieuwe Overvecht-code — geen tweede platform. |
| **Should** | 4 | Seizoen & weer scherper | `packages/core/src/weather.js`, `growth.js`; UI `SeasonBanner.js`; tests `packages/core/tests/`, `packages/backend/tests/season.test.js`. Verbeter het **huidige** systeem; geen nieuw weer-systeem van nul. |
| **Should** | 5 | Duidelijkere doelen / quests | Koppel bestaande doelen aan tuinacties. Plugin `plugins/community/achievements/`; UI `AchievementsPanel.js`. Uitbreiden, niet vervangen. |
| **Should** | 6 | Samenwerken / ruilen versterken | `packages/backend/src/routes/trade.js`, `src/socket/`; UI `TradeModal.js`; tests `trade.test.js`, `e2e/tests/marketplace.spec.js`. |
| **Should** | 7 | Progressie zichtbaarder | Seizoensfilter op de leaderboard bestaat al (`?season=`). UI `Leaderboard.js`, `AchievementsPanel.js`; backend `routes/leaderboard.js`. |
| **Could** | 8 | Nieuwe community-plugin(s) | Kopieer een map onder `plugins/community/`. Exporteer `{ name, version, init(api) }` vanuit `index.js`. `name` = map (`kebab-case`). |
| **Could** | 9 | Bestaande plugins uitbreiden | `weather-forecast`, `achievements`, `seasons`, `daily-bonus`, `crop-prices`, … |
| **Could** | 10 | Plugin-marketplace / install-flow | UI `PluginMarketplace.js`, `PluginConfigurator.js`; API `packages/backend/src/routes/plugins.js`. |

**Won’t (hier geen projectsprint aan besteden)**

| # | Buiten scope |
|---|----------------|
| 11 | Geen herbouw van de game-engine of wereldkaart-renderer (Pixi/DOM). Optimaliseren mag. |
| 12 | Geen verplichte centrale cloud of app-store-release. Self-hosting (Pi) blijft het model. **Steam / App Store / Play Store vallen buiten scope.** |
| 13 | Geen volledige WCAG AA/AAA-audit van alle schermen. Wel meenemen waar de verbindingsflow het nodig heeft. |
| 14 | P2P / Hyperswarm-federatie is niet de succesmeting (hoogstens een klein experiment). |
| 15 | Geen extra platform of monorepo-split. Werken in `frontend` / `backend` / `core` / `plugins`. |

Steam staat al **uit** (`packages/desktop/steam_appid.txt` = `0`). Opnieuw uitzetten: `npm run steam:disable`. Zet geen GitHub-secrets `STEAM_*` en negeer `.github/workflows/steam-deploy.yml`.

### 4. Testen (verplicht bij studentwerk)

Workflow uit het projectplan: **lokaal starten → wijzigen in het juiste package → unittests → `verify:quick` → Playwright voor de gebruikersflow → PR met ontwerpkeuzes en testresultaten.**

De meeste tests draaien **in-memory** (geen Postgres/Redis). In-memory is voor snelheid; data verdwijnt bij herstart. Als je feature **moet bewaren**, test ook met een echte `DATABASE_URL` voordat je het “af” noemt (lokale Postgres, daarna `cd packages/backend && npm run db:migrate`). Volledige Docker Compose is productie-achtig ([INSTALL.md](../INSTALL.md)); dagelijks werk blijft `bash start.sh`.

**Unit- / packagetests** (vanaf de repo-root tenzij anders):

```bash
# Gedeelde spelregels
cd packages/core && npm test

# API, tuin, handel, plugins, security (in-memory)
cd packages/backend && npm test

# UI (geen watch — gewoon `npm test` in het frontend-pakket blijft hangen)
npm run test:frontend:ci

# Eén bestand terwijl je itereert
cd packages/backend && npx jest tests/qr.test.js
cd packages/frontend && CI=true npx react-scripts test --watchAll=false --runInBand src/__tests__/QRPanel.test.js
```

**Hele baseline** (core + backend + frontend CI + desktop):

```bash
npm run verify:quick
```

Dichter bij CI (lint, Gradendex-sync, production-frontend-build): `npm run verify:local`. Zie [README.md](../README.md#local-verification-ci-parity).

**Playwright E2E** (Must #3 en elke zichtbare spelerflow). Specs verwachten **Engelse** UI (`garden_lang=en`):

```bash
cd e2e
npm install
npx playwright install chromium
CI=true npx playwright test
```

Alleen smoke: `cd e2e && npm run test:smoke`.

Als poort **5000** bezet is (vaak macOS AirPlay):

```bash
cd e2e && E2E_BACKEND_PORT=5001 E2E_FRONTEND_PORT=3001 CI=true npx playwright test
```

Voeg een spec toe naast `e2e/tests/garden.spec.js` / `smoke.spec.js` wanneer je de Overvecht-keten oplevert.

**PR-testlat:** vink `npm run verify:quick` aan op het [PR-template](../.github/PULL_REQUEST_TEMPLATE.md), noem de tests die je draaide, en beschrijf conflictgedrag (lokaal vs server) als je sync aanraakt.

### 5. Eerste week (voorstel)

1. `bash start.sh` — gast + registreren; ploegen/zaaien/water geven op het perceel waar je staat (toolknoppen, niet de kaarttegels).
2. Lees de Must #1-bestanden (offline-queue, garden `409`, QR).
3. Kies **één** plak Must #3 (bijv. plot-QR scannen → beloning in de game) en schrijf eerst de falende test.
4. Should/Could bewaren voor latere sprints, tenzij een Must-plak al demo-baar is.

### 6. Kleine voorbeelden (optioneel)

**Plant toevoegen** — `packages/core/src/plants.js` + `packages/core/tests/`.  
**UI-tekst** — `packages/frontend/src/i18n/locales/` (eerst `en.json` en `nl.json`). Geen hardcoded Engels in JSX.  
**API** — `packages/backend/src/routes/` + een bestand onder `packages/backend/tests/`.

### 7. Pull request sturen

1. Fork en branch (`feature/…`, `fix/…` of `docs/…`).
2. [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …).
3. Tests bij nieuw gedrag (Jest en, voor Must #3, Playwright).
4. `CHANGELOG.md` bijwerken onder `[Unreleased]`.
5. PR naar `main`: wat je wijzigde, **waarom** (MoSCoW #), ontwerpkeuzes, testcommando’s + resultaten.

Meer detail: [CONTRIBUTING.md](../CONTRIBUTING.md).

### 8. Extra (alleen als je het nodig hebt)

| Doel | Doc |
|------|-----|
| Productie-installatie (Pi, Docker, macOS, Termux) | [INSTALL.md](../INSTALL.md) |
| Omgevingsvariabelen voor een echte server | [PRODUCTION_ENV_TEMPLATE.md](../PRODUCTION_ENV_TEMPLATE.md) |
| Store-signing / Discord / Steam (niet de student-Must) | [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md) |
| Hoe je speelt | [PLAYERS_GUIDE.md](PLAYERS_GUIDE.md) |
