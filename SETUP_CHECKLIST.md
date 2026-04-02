# AllOne Garden — Setup checklist

*(All project docs are in English.)*

This file tracks **manual configuration and ops steps** that require external accounts, signing keys, or infrastructure that cannot be automated. Work through this list before shipping to production.

For automated checks that mirror most of CI (lint, tests, Gradendex sync, frontend build), run from the repo root:

```bash
npm run verify:local
```

See [README.md — Local verification](README.md#local-verification-ci-parity) for `verify:quick`, `verify:local`, and related scripts.

---

## Steam (Steamworks)

- [ ] **Create a Steamworks app**
  - Go to https://partner.steamgames.com/ and create a new app.
  - Note the **App ID** (e.g. `1234567`).

- [ ] **Set the App ID**
  ```
  packages/desktop/steam_appid.txt
  ```
  Replace `0` with your App ID.

- [ ] **Set `STEAM_APP_ID` in `.env` (optional, overrides steam_appid.txt)**
  ```
  STEAM_APP_ID=1234567
  ```

- [ ] **Create achievements in the Steamworks dashboard**  
  Required API names (exact spelling):
  | API Name | Description |
  |---|---|
  | `FIRST_HARVEST` | First harvest |
  | `GREEN_THUMB` | 10 plants grown |
  | `SEASONED_FARMER` | 50 plants grown |
  | `MASTER_GARDENER` | 100 plants grown |
  | `FIRST_SALE` | First sale |
  | `BARN_BUILT` | Barn built |
  | `GREENHOUSE_BUILT` | Greenhouse built |
  | `EGG_COLLECTOR` | Eggs collected |
  | `MILK_COLLECTOR` | Milk collected |
  | `PLANT_ID` | Plant identified from photo |
  | `LEVEL_5` | Level 5 reached |
  | `LEVEL_10` | Level 10 reached |

- [ ] **Update depot configs**  
  Replace `YOUR_APP_ID` and `YOUR_DEPOT_ID_*` in:
  - `packages/desktop/steam/app_build.vdf`
  - `packages/desktop/steam/depot_win.vdf`
  - `packages/desktop/steam/depot_mac.vdf`
  - `packages/desktop/steam/depot_linux.vdf`

- [ ] **Configure GitHub Secrets for Steam CI**  
  Go to: *Repository → Settings → Secrets and variables → Actions*
  | Secret | Value |
  |---|---|
  | `STEAM_USERNAME` | Your Steam build account username |
  | `STEAM_CONFIG_VDF` | Base64-encoded `config.vdf` from `~/.steam/steam/config/` |
  | `STEAM_APP_ID` | Your App ID |

---

## Discord Rich Presence

- [ ] **Create a Discord application**
  - Go to https://discord.com/developers/applications and create a new app.
  - Note the **Application ID** (Client ID).

- [ ] **Set `DISCORD_APP_ID`**  
  In `packages/desktop/.env` (or as an environment variable):
  ```
  DISCORD_APP_ID=123456789012345678
  ```

- [ ] **Upload game assets to the Discord Developer Portal**
  - Add an asset named `garden_logo` (Rich Presence → Art Assets).
  - Minimum size: 512×512 px.

---

## Mobile (Capacitor — Android & iOS)

### Android

- [ ] **Install Android Studio** (https://developer.android.com/studio)

- [ ] **Generate the native Android project**
  ```bash
  cd packages/frontend
  npm run build
  npx cap add android
  npx cap sync android
  ```

- [ ] **Open in Android Studio and test on emulator/device**
  ```bash
  npx cap open android
  ```

- [ ] **Create signing keystore (for release builds)**
  ```bash
  keytool -genkey -v -keystore allone-garden.jks \
    -alias allone-garden -keyalg RSA -keysize 2048 -validity 10000
  ```

- [ ] **Configure GitHub Secrets for Android CI (signed release)**
  | Secret | Value |
  |---|---|
  | `ANDROID_KEYSTORE_BASE64` | `base64 allone-garden.jks` |
  | `ANDROID_KEYSTORE_PASSWORD` | Password you set in keytool |
  | `ANDROID_KEY_ALIAS` | `allone-garden` |
  | `ANDROID_KEY_PASSWORD` | Key password |

### iOS

- [ ] **Install Xcode** (macOS required, App Store)

- [ ] **Generate the native iOS project**
  ```bash
  cd packages/frontend
  npx cap add ios
  npx cap sync ios
  ```

- [ ] **Set up an Apple Developer account** (https://developer.apple.com)
  - Create an **App ID** with bundle ID `com.allonegarden.app`.
  - Create a **distribution certificate** and **provisioning profile**.

- [ ] **Enable the iOS CI job** in `.github/workflows/mobile-build.yml`  
  Uncomment the `build-ios` block and set secrets:
  | Secret | Value |
  |---|---|
  | `APPLE_CERTIFICATE` | Base64 of `.p12` distribution key |
  | `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
  | `APPLE_ISSUER_ID` | App Store Connect API issuer ID |
  | `APPLE_API_KEY_ID` | App Store Connect API key ID |
  | `APPLE_API_PRIVATE_KEY` | Contents of the `.p8` key file |

---

## Push notifications (Capacitor)

- [ ] **Create a Firebase project** (Android FCM)
  - Go to https://console.firebase.google.com/ and create a project.
  - Add an Android app with package name `com.allonegarden.app`.
  - Download `google-services.json` and place it in `packages/frontend/android/app/`.
  - Note the **Server Key** for backend: `FIREBASE_SERVER_KEY=...` in `.env`.

- [ ] **Create APNs key** (iOS)
  - Apple Developer → Certificates → Keys → Create an APNs key.
  - Download the `.p8` file and note Key ID and Team ID.
  - Add to Firebase project (Project Settings → Cloud Messaging → iOS).

- [ ] **Add `FIREBASE_SERVER_KEY` to `packages/backend/.env`**

---

## Production server

- [ ] **Configure production `.env`** (see `packages/backend/.env.example`)  
  Minimum required:
  ```
  JWT_SECRET=<long random string>
  DATABASE_URL=postgres://...  (or empty for SQLite)
  NODE_ENV=production
  PORT=5000
  FRONTEND_URL=https://yourdomain.com
  ```

- [ ] **Start Docker Compose**
  ```bash
  docker compose up -d
  ```

- [ ] **Set up SSL certificate** (Let's Encrypt via nginx/Caddy)

- [ ] **Configure auto-update server** (Electron)  
  `electron-updater` expects a `latest.yml` on an HTTPS endpoint.  
  Recommended: **GitHub Releases** — set `publish.provider: github` in `electron-builder.yml`.
  - Create a **GitHub Personal Access Token** with `repo` scope.
  - Add as GitHub Secret: `GH_TOKEN`.

---

## AI plant recognition (optional)

Users can store their own API keys in Account Settings.  
Want a **server-side fallback key**?

- [ ] Add to `packages/backend/.env`:
  ```
  OPENAI_API_KEY=sk-...        # fallback if user has no key
  ANTHROPIC_API_KEY=sk-ant-... # same
  GEMINI_API_KEY=AIza...       # same
  ```

---

## Gradendex (developers)

If you change plant or structure text in `scripts/gradendex-entries-overrides/{lang}.json`:

1. `cd packages/frontend && npm run gradendex:extra`
2. Commit both the overrides and the updated `src/i18n/gradendex.*.json` (otherwise CI **Lint** or **Frontend build** fails).

---

## Quick sanity check — does everything run?

```bash
# Automated (closest to CI lint + tests + Gradendex + frontend build)
npm run verify:local

# Backend (manual)
cd packages/backend && npm start
# → http://localhost:5000/health should return {"status":"ok"}

# Frontend (dev)
cd packages/frontend && npm start
# → http://localhost:3000

# Desktop (dev)
cd packages/desktop && npm start
# → Electron window opens with setup wizard

# Tests only (from repo root)
npm run test:backend
npm run test:frontend:ci   # non-interactive; same flags as verify scripts
npm run test:desktop
```

Playwright E2E (`e2e/`), `npm audit`, and Docker image build run in [GitHub Actions](.github/workflows/ci.yml), not via `verify:local`.

**E2E locally:** From the repo root, after `cd e2e && npm install && npx playwright install chromium`, run `CI=true npx playwright test`. Defaults: backend **5000**, frontend **3000** (both must be free). If **5000** is taken (common on macOS — AirPlay Receiver), use alternate ports without editing files:

```bash
cd e2e && E2E_BACKEND_PORT=5001 E2E_FRONTEND_PORT=3001 CI=true npx playwright test
```

`E2E_BACKEND_PORT` / `E2E_FRONTEND_PORT` are read by [`e2e/playwright.config.js`](e2e/playwright.config.js) together with `REACT_APP_API_URL` / `FRONTEND_URL`.
