# AGENTS.md

## Cursor Cloud specific instructions

AllOne Garden is an npm **workspaces** monorepo (`packages/*`). The main product is a
self-hostable multiplayer gardening web game: a Node/Express + Socket.IO **backend**
(`packages/backend`, port 5000) and a React (CRA) **frontend** (`packages/frontend`,
port 3000). `packages/core` is pure game logic; `packages/desktop` is an Electron wrapper.

Dependencies are installed by the startup update script (`npm install` at the repo root,
which installs and links every workspace). The notes below are the non-obvious things a
fresh agent needs; standard commands live in [`README.md`](README.md),
[`INSTALL.md`](INSTALL.md), and the root/package `package.json` scripts.

### Running the app (development)
- `bash start.sh` starts backend + frontend together (via `concurrently`). It auto-creates
  `packages/backend/.env` from the example on first run and picks free ports if 5000/3000
  are busy. No PostgreSQL or Redis is required — the backend runs in **in-memory mode**
  (empty `DATABASE_URL`). Data is lost on restart; that is expected here.
- The repeated `[redis] Connection error (falling back to in-memory)` lines in the backend
  log are **harmless** — Redis is optional and the server falls back to in-memory.

### Browser testing gotcha (important)
- The world map renders with **pixi.js/WebGL**, which crashes Chrome in this headless VM
  ("Aw, Snap! / Error code: 4"). The app supports a DOM/CSS map fallback. For any browser
  testing, force it with the env var: `REACT_APP_PIXI_MAP=off bash start.sh` (or
  `REACT_APP_PIXI_MAP=off` on the frontend dev command). With the DOM map the game loads
  and plays reliably. Values: `off`/`dom` = DOM map, `on` = pixi, `auto` (default) = auto.
- Planting/tilling in the "Mijn moestuin" panel act on the plot the character is standing
  on (click the tool buttons, not the map tiles); the character sprite can visually cover
  the plot it stands on.

### Tests / lint / build
- Standard commands are in the root `package.json` (`npm test`, `npm run verify:quick`,
  `npm run test:frontend:ci`, etc.). Frontend Jest must run in CI mode
  (`npm run test:frontend:ci`) — interactive watch mode hangs otherwise. Backend tests
  need `NODE_ENV=test DATABASE_URL= JWT_SECRET=<32+ char string>` (see `verify:local`).
- `packages/desktop` (`npm run test:desktop`) has **2 pre-existing test failures in this VM**
  that are environment artifacts, not real regressions: the tests assume `process.execPath`
  is literally `node`, but here it is `/exec-daemon/node`. CI (`.github/workflows/ci.yml`)
  does **not** run desktop tests, so these do not gate merges.

### Backend quick check without a browser
- REST auth: `POST /api/auth/register` (needs `username`, `email`, `password`) returns a JWT;
  `GET /api/auth/me` with `Authorization: Bearer <token>` echoes the user.
- Real-time chat: connect a `socket.io-client` to `http://localhost:5000` with
  `auth: { token }`, emit `chat:message` `{ text }`, and the server broadcasts `chat:message`
  with the JWT-bound `username`. Useful for verifying the socket layer without the UI.
