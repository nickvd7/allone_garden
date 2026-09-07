# AllOne Garden — Builder quick start / Snelstartgids voor bouwers

This page is available in **English** first, then **Dutch (Nederlands)** — same structure in both languages.

Steam, Discord, PostgreSQL, Redis, and app-store signing are **not required** to start building. Steam is **off by default**; skip it unless you publish on Steam.

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

You do **not** need PostgreSQL, Redis, a Steamworks account, Discord, Docker, or a Raspberry Pi.

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

This is an npm **workspaces** monorepo (`packages/*`).

| Path | What it is | Typical first edit |
|------|------------|--------------------|
| `packages/core` | Pure game rules (plants, growth, weather, companions) — no server | Add a plant in `src/plants.js` |
| `packages/backend` | Node, Express, Socket.IO — API, auth, garden save, chat, plugins | `src/routes/`, `src/socket/` |
| `packages/frontend` | React (Create React App) UI | `src/components/`, `src/i18n/locales/` |
| `packages/desktop` | Optional Electron wrapper | Skip unless you ship a desktop app |
| `plugins/community/` | Sandboxed community plugins | Copy an existing plugin folder |

Default ports: frontend **3000**, backend **5000**. Health check: `http://localhost:5000/health`.

### 3. First change (examples)

**Add a plant** — edit `packages/core/src/plants.js` (slug, emoji, growth days, coins, companions). Add a test in `packages/core/tests/` if the rule is new. Run `cd packages/core && npm test`.

**Change the UI** — components live in `packages/frontend/src/components/`. User-facing strings go in `packages/frontend/src/i18n/locales/` (start with `en.json` and `nl.json`, then other locales). Do not hardcode English in JSX.

**Change the API** — routes in `packages/backend/src/routes/`. Add a Jest test under `packages/backend/tests/` (no database needed). Run `cd packages/backend && npm test`.

**Add a plugin** — copy a folder under `plugins/community/` (for example `server-motd`). Export `{ name, version, init(api) }` from `index.js`. `name` must match the folder (`kebab-case`). Restart the backend to load it.

**Translate** — copy keys into your locale file and register the language in `packages/frontend/src/i18n/config.js` if it is new. See [CONTRIBUTING.md](../CONTRIBUTING.md#translations).

### 4. Tests and checks

From the **repository root**:

```bash
# Fast local suite (core + backend + frontend CI + desktop)
npm run verify:quick

# Frontend Jest only (non-watch — do not use plain `npm test` in the frontend package)
npm run test:frontend:ci

# Backend only (in-memory; set a dummy JWT in CI-style env if you copy verify:local)
cd packages/backend && npm test
```

Frontend tests must run with `CI=true` (`npm run test:frontend:ci`). Interactive watch mode hangs in many environments.

Full contributor flow (lint, Gradendex sync, production frontend build): `npm run verify:local`. See [README.md](../README.md#local-verification-ci-parity).

### 5. Steam — optional, off by default (skip this)

Local web development **never** talks to Steam. You can ignore Steam completely.

**Keep Steam off** (already the default):

- `packages/desktop/steam_appid.txt` is `0`
- `packages/desktop/.env.example` has `STEAM_APP_ID=0`

Force it off after someone enabled it:

```bash
bash scripts/disable-steam.sh
# or: npm run steam:disable
```

That writes App ID `0` and, if `packages/desktop/.env` exists, sets `STEAM_APP_ID=0`. Desktop still runs; Steam achievements become no-ops.

**Remove Steam from a fork** (you will not publish on Steam):

1. Run `bash scripts/disable-steam.sh` so the App ID stays `0`.
2. Do **not** set GitHub secrets `STEAM_USERNAME`, `STEAM_CONFIG_VDF`, or `STEAM_APP_ID`.
3. Ignore [`.github/workflows/steam-deploy.yml`](../.github/workflows/steam-deploy.yml) — it only runs on `v*.*.*` tags or manual dispatch.
4. Optional hard cut: uninstall `steamworks.js` from `packages/desktop` (`optionalDependencies`), delete `packages/desktop/steam/`, and skip Steam items in [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md). The web game does not import Steam.

**Enable Steam later** (Steamworks App ID required): [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md#steam-steamworks).

### 6. Send a pull request

1. Fork the repo and branch (`feature/…`, `fix/…`, or `docs/…`).
2. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …).
3. Add or update tests when behaviour changes.
4. Update `CHANGELOG.md` under `[Unreleased]`.
5. Open a PR against `main`. Template: [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

More detail: [CONTRIBUTING.md](../CONTRIBUTING.md).

### 7. Extra (only when you need it)

| Goal | Doc |
|------|-----|
| Production install (Pi, Docker, macOS, Termux) | [INSTALL.md](../INSTALL.md) |
| Env vars for a real server | [PRODUCTION_ENV_TEMPLATE.md](../PRODUCTION_ENV_TEMPLATE.md) |
| Steam / Discord / mobile signing / store secrets | [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md) — skip Steam unless you ship on Steam |
| How to play | [PLAYERS_GUIDE.md](PLAYERS_GUIDE.md) |

---

## Nederlands

### Wat je nodig hebt

| Tool | Opmerkingen |
|------|-------------|
| **Node.js 18+** | 20 LTS aanbevolen — [nodejs.org](https://nodejs.org) |
| **Git** | Clonen en pullen |
| **Een browser** | Chrome, Firefox, Safari of Edge |

Je hebt **geen** PostgreSQL, Redis, Steamworks-account, Discord, Docker of Raspberry Pi nodig.

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

Dit is een npm **workspaces**-monorepo (`packages/*`).

| Pad | Wat het is | Typische eerste wijziging |
|-----|------------|---------------------------|
| `packages/core` | Pure spelregels (planten, groei, weer, buren) — geen server | Plant toevoegen in `src/plants.js` |
| `packages/backend` | Node, Express, Socket.IO — API, auth, tuin opslaan, chat, plugins | `src/routes/`, `src/socket/` |
| `packages/frontend` | React (Create React App) UI | `src/components/`, `src/i18n/locales/` |
| `packages/desktop` | Optionele Electron-wrapper | Overslaan tenzij je een desktop-app uitbrengt |
| `plugins/community/` | Plugins in een sandbox | Kopieer een bestaande plugin-map |

Standaardpoorten: frontend **3000**, backend **5000**. Health check: `http://localhost:5000/health`.

### 3. Eerste wijziging (voorbeelden)

**Plant toevoegen** — bewerk `packages/core/src/plants.js` (slug, emoji, groeidagen, munten, companions). Voeg een test toe in `packages/core/tests/` als de regel nieuw is. Run `cd packages/core && npm test`.

**UI wijzigen** — componenten staan in `packages/frontend/src/components/`. Teksten voor spelers horen in `packages/frontend/src/i18n/locales/` (begin met `en.json` en `nl.json`). Zet geen hardcoded Engels in JSX.

**API wijzigen** — routes in `packages/backend/src/routes/`. Voeg een Jest-test toe onder `packages/backend/tests/` (geen database nodig). Run `cd packages/backend && npm test`.

**Plugin toevoegen** — kopieer een map onder `plugins/community/` (bijvoorbeeld `server-motd`). Exporteer `{ name, version, init(api) }` vanuit `index.js`. `name` moet overeenkomen met de map (`kebab-case`). Herstart de backend om te laden.

**Vertalen** — zet keys in je locale-bestand en registreer een nieuwe taal in `packages/frontend/src/i18n/config.js`. Zie [CONTRIBUTING.md](../CONTRIBUTING.md#translations).

### 4. Tests en checks

Vanaf de **root van de repo**:

```bash
# Snelle lokale suite (core + backend + frontend CI + desktop)
npm run verify:quick

# Alleen frontend Jest (geen watch — gebruik niet gewoon `npm test` in het frontend-pakket)
npm run test:frontend:ci

# Alleen backend (in-memory)
cd packages/backend && npm test
```

Frontend-tests moeten met `CI=true` (`npm run test:frontend:ci`). Interactieve watch-modus blijft in veel omgevingen hangen.

Volledige contributor-check (lint, Gradendex-sync, production-frontend-build): `npm run verify:local`. Zie [README.md](../README.md#local-verification-ci-parity).

### 5. Steam — optioneel, standaard uit (overslaan)

Lokale webontwikkeling praat **nooit** met Steam. Je kunt Steam volledig negeren.

**Steam uit laten** (al de standaard):

- `packages/desktop/steam_appid.txt` is `0`
- `packages/desktop/.env.example` heeft `STEAM_APP_ID=0`

Opnieuw uitzetten als iemand het had aangezet:

```bash
bash scripts/disable-steam.sh
# of: npm run steam:disable
```

Dat zet App ID op `0` en, als `packages/desktop/.env` bestaat, `STEAM_APP_ID=0`. Desktop blijft werken; Steam-achievements doen niets.

**Steam uit een fork halen** (je publiceert niet op Steam):

1. Run `bash scripts/disable-steam.sh` zodat de App ID `0` blijft.
2. Zet **geen** GitHub secrets `STEAM_USERNAME`, `STEAM_CONFIG_VDF` of `STEAM_APP_ID`.
3. Negeer [`.github/workflows/steam-deploy.yml`](../.github/workflows/steam-deploy.yml) — die draait alleen bij `v*.*.*`-tags of handmatig.
4. Optioneel hard knippen: verwijder `steamworks.js` uit `packages/desktop` (`optionalDependencies`), verwijder `packages/desktop/steam/`, en sla Steam-items in [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md) over. Het webspel importeert Steam niet.

**Steam later aanzetten** (Steamworks App ID verplicht): [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md#steam-steamworks).

### 6. Pull request sturen

1. Fork de repo en maak een branch (`feature/…`, `fix/…` of `docs/…`).
2. Gebruik [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …).
3. Voeg tests toe of werk ze bij als gedrag verandert.
4. Werk `CHANGELOG.md` bij onder `[Unreleased]`.
5. Open een PR naar `main`. Template: [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).

Meer detail: [CONTRIBUTING.md](../CONTRIBUTING.md).

### 7. Extra (alleen als je het nodig hebt)

| Doel | Doc |
|------|-----|
| Productie-installatie (Pi, Docker, macOS, Termux) | [INSTALL.md](../INSTALL.md) |
| Omgevingsvariabelen voor een echte server | [PRODUCTION_ENV_TEMPLATE.md](../PRODUCTION_ENV_TEMPLATE.md) |
| Steam / Discord / mobiel ondertekenen / store-secrets | [SETUP_CHECKLIST.md](../SETUP_CHECKLIST.md) — sla Steam over tenzij je op Steam uitbrengt |
| Hoe je speelt | [PLAYERS_GUIDE.md](PLAYERS_GUIDE.md) |
