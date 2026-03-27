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
- **i18n** — English and Dutch out of the box

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
│       │   └── i18n/       en, nl
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
