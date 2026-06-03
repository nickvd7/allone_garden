# AllOne Garden — Installation Guide

## Quick start (local development)

No database needed — the backend runs in in-memory mode.

```bash
# Clone
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden

# Start everything
bash start.sh
```

Open **http://localhost:3000** in your browser.
You can play as a Guest (offline) or register an account (stored in memory until you add PostgreSQL).

---

## With PostgreSQL + Redis (full persistence)

### Requirements
- Node.js 20+
- PostgreSQL 14+
- Redis 7+

```bash
# 1. Clone and install
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden

# 2. Configure the backend
cd packages/backend
cp .env.example .env
# Edit .env: set DATABASE_URL, REDIS_URL, JWT_SECRET

# 3. Create database tables (+ incremental migrations)
npm run db:migrate

# 4. (Optional) Seed demo data
npm run db:seed

# 5. Start
cd ../..
bash start.sh
```

---

## macOS (production — Homebrew + pm2)

```bash
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden
bash install-mac.sh
```

What the script does:
- Uses Homebrew to ensure Node.js 18+, **PostgreSQL 16**, and Redis (installs or starts services as needed)
- Creates the `allone_garden` database and a `garden` role with a random password (or resets the role password on re-runs so it stays in sync)
- Writes **`packages/backend/.env`**: on first run it creates the file (including `JWT_SECRET`); on every run it sets or updates **`DATABASE_URL`** so the password always matches PostgreSQL
- Starts the server with **pm2** (auto-restarts on crash, survives terminal close)
- Configures pm2 to start on login

After install:

```bash
pm2 status                        # see running processes
pm2 logs allone-garden            # live logs
pm2 restart allone-garden         # restart
pm2 stop allone-garden            # stop
```

Open **http://localhost:5000** to play. Other devices on the same network can join at your local IP.

---

## Windows (development / home server)

**Option A — PowerShell (recommended):**

```powershell
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden
.\start.ps1
```

**Option B — Command Prompt:**

```cmd
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden
start.bat
```

Both options:
- Check for Node.js 18+ (download from https://nodejs.org if missing)
- Install npm dependencies automatically
- Copy `.env.example` → `.env` on first run
- Start backend (port 5000) and frontend dev server (port 3000) simultaneously

For a persistent Windows server use Docker Desktop (see Docker section below) or WSL2 + the Linux installer.

---

## Android phone (Termux server)

Run a full AllOne Garden server from your Android phone — other devices on the same Wi-Fi network can connect to it.

**Requirements:** Termux from F-Droid (NOT from Google Play), Android 7+, 1 GB free storage.

```bash
# In Termux:
pkg install git
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden
bash install-termux.sh
```

What the script does:
- Installs Node.js, PostgreSQL, Redis, and OpenSSL via `pkg`
- Starts PostgreSQL, waits until it is ready, then creates the `allone_garden` database and a `garden` role (or resets the role password on re-runs)
- Writes **`packages/backend/.env`**: first run creates it (including `JWT_SECRET`); every run sets or updates **`DATABASE_URL`** so it matches PostgreSQL
- Detects your Wi-Fi IP and writes it into `.env` as `FRONTEND_URL`
- Builds the React frontend and copies it into the backend `/public` folder
- Creates a `start-android.sh` convenience script

To start the server after a reboot:

```bash
bash start-android.sh
```

> **Tip:** Install **Termux:Boot** from F-Droid to auto-start the server on reboot.
> Keep Termux open (or use a wake-lock app) while players are connected.

---

## Raspberry Pi (production — one command)

Tested on Pi 3B+, Pi 4, Pi 5 running Raspberry Pi OS Bookworm (64-bit).

### Schone installatie (aanbevolen bij problemen)

Verwijdert niets uit je home-map; installeert vers naar **`/opt/allone-garden`** (oude map wordt hernoemd naar `.bak.<datum>`):

```bash
curl -fsSL https://raw.githubusercontent.com/nickvd7/allone_garden/main/install-fresh.sh | sudo bash
```

Of vanuit een clone: `sudo bash install-fresh.sh`

Daarna: game-URL via nginx (zie install-summary), `sudo systemctl status allone-garden`, updates via `sudo bash /opt/allone-garden/update.sh`.

### Standaard install / herinstallatie in bestaande map

```bash
# Basic install (HTTP only)
sudo bash install.sh

# With HTTPS (requires a domain pointed at your Pi)
sudo GARDEN_DOMAIN=garden.example.com GARDEN_EMAIL=you@example.com bash install.sh
```

What the script does:
- Installs Node.js 20, PostgreSQL, Redis, Nginx, Certbot
- Creates a `garden` system user
- Clones the repo to `/opt/allone-garden`
- Enables PostgreSQL, waits until `pg_isready` succeeds, then ensures the DB user exists with a random password (`CREATE` or `ALTER USER` on re-runs)
- Writes **`packages/backend/.env`**: first run creates it (including `JWT_SECRET`); every run sets or updates **`DATABASE_URL`** so it matches PostgreSQL
- Builds the frontend (service worker cache id = git commit — clients pick up new UI after refresh)
- Runs all PostgreSQL migrations (`npm run db:migrate`, incl. DM tables)
- Creates a `systemd` service (`allone-garden`) that starts on boot
- Configures Nginx as a reverse proxy
- Optionally requests a Let's Encrypt TLS certificate

After install:

```bash
# Status
sudo systemctl status allone-garden

# Logs
sudo journalctl -u allone-garden -f

# Restart
sudo systemctl restart allone-garden

# Update na een nieuwe release (zonder apt — sneller dan install.sh opnieuw)
cd /opt/allone-garden   # of jouw clone, bijv. ~/coding/allone_garden
sudo bash update.sh
```

`update.sh` detecteert de map waarin het script staat (niet alleen `/opt/allone-garden`). Bij `sudo` draait git/npm als jouw gebruiker (`SUDO_USER`). Git gebruikt anonieme `ls-remote`/`fetch` tegen GitHub (geen wachtwoordprompt). Het script doet: code bijwerken → dependencies → frontend build (nieuwe service-worker cache) → PostgreSQL-wachtwoord sync (indien nodig) → `npm run db:migrate` → herstart `allone-garden` + nginx (als die units bestaan).

**`password authentication failed for user "garden"`:** het wachtwoord in `packages/backend/.env` komt niet overeen met PostgreSQL. Oplossing: `sudo bash scripts/sync-postgres-env.sh` (in de repo-root), daarna opnieuw `sudo bash update.sh`.

Als `git pull` op de Pi om een wachtwoord vraagt, kun je de remote omzetten naar SSH (`git remote set-url origin git@github.com:nickvd7/allone_garden.git`) of na een handmatige `git pull`: `UPDATE_SKIP_GIT_PULL=1 sudo bash update.sh`.

---

## Docker (easiest for cloud / VPS)

```bash
git clone https://github.com/nickvd7/allone_garden.git
cd allone_garden
docker-compose up
```

Services started:
| Service  | Port |
|----------|------|
| Frontend | 3000 |
| Backend  | 5000 |
| Postgres | 5432 |
| Redis    | 6379 |

The backend container runs `npm run db:migrate` on start (via `docker-entrypoint.sh`) before serving traffic.

---

## Play on iOS / Android (PWA — no app store needed)

AllOne Garden is a **Progressive Web App**. Players open the server URL in their phone browser and add it to the home screen — it then behaves like a native app.

### iOS (Safari)

1. Open the game URL in **Safari** (e.g. `http://192.168.1.10:5000`)
2. Tap the **Share** button (box with arrow, bottom of screen)
3. Scroll down and tap **"Add to Home Screen"**
4. Confirm the name and tap **Add**

The game icon appears on the home screen and opens in full-screen mode without the browser toolbar.

> Safari is required on iOS — Chrome/Firefox on iOS cannot install PWAs.

### Android (Chrome)

1. Open the game URL in **Chrome**
2. Tap the **⋮ menu** (top right)
3. Tap **"Add to Home screen"** or **"Install app"**
4. Tap **Install**

Chrome may also show an automatic install banner at the bottom of the screen.

### What works offline?

The service worker caches the app shell so the game loads instantly even without a network connection. Gameplay (garden saving, chat, trade) requires the server to be reachable.

---

## P2P Federation

To join the global AllOne Garden network and enable cross-server garden visits:

```bash
# In packages/backend/.env
P2P_ENABLED=true
SERVER_NAME=My Garden Server

# Then restart
sudo systemctl restart allone-garden
```

Your server will automatically discover other nodes via the Hyperswarm DHT.
No central server required.

---

## Plugin system

Community plugins live in `plugins/community/`.
Each plugin is a folder with an `index.js` exporting `{ name, version, init(api) }`.

Pre-installed community plugins:
- `weather-forecast` — 5-day forecast broadcast to all players
- `achievements` — 19 unlockable badges for gameplay milestones

To install a new plugin:

```bash
cp -r my-plugin plugins/community/
sudo systemctl restart allone-garden
```

---

## Hardware requirements

| Device / Hardware     | Players | Notes                                         |
|-----------------------|---------|-----------------------------------------------|
| Raspberry Pi 5 (8 GB) | 50–100  | Full features, recommended for communities    |
| Raspberry Pi 4 (4 GB) | 20–50   | Good performance                              |
| Raspberry Pi 3B+      | 10–20   | Basic features, limited RAM                   |
| Any Linux VPS (1 GB+) | 50+     | Works great, easiest for public servers       |
| macOS (M-series/Intel)| 20–50   | Good for home/LAN hosting via pm2             |
| Windows PC            | 10–20   | Via Docker Desktop or WSL2 for persistence    |
| Android phone (mid-range) | 5–15 | Great for friends/LAN; keep phone plugged in |

---

## Troubleshooting

**Port already in use:**
```bash
# Change PORT in packages/backend/.env
PORT=5001
```

**Database connection failed:**
```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

**Frontend build fails:**
```bash
cd packages/frontend
rm -rf node_modules
npm install
npm run build
```

**Need help?**
- Issues: https://github.com/nickvd7/allone_garden/issues
- Discussions: https://github.com/nickvd7/allone_garden/discussions
