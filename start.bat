@echo off
:: =============================================================================
:: AllOne Garden — Windows development starter (Command Prompt)
:: Double-click or run from project root: start.bat
:: For a better experience use start.ps1 in PowerShell instead.
:: =============================================================================
title AllOne Garden

echo.
echo   ^[32m🌱  AllOne Garden — Development Mode (Windows)^[0m
echo.

:: ── Node.js check ─────────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo ❌  Node.js not found.
    echo     Download from https://nodejs.org ^(LTS version^)
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -e "process.stdout.write(process.version)"') do set NODE_VER=%%v
echo ✅  Node.js %NODE_VER% found

:: ── Install dependencies ───────────────────────────────────────────────────────
if not exist "node_modules" (
    echo [setup] Installing root dependencies...
    npm install --silent
)
if not exist "packages\backend\node_modules" (
    echo [setup] Installing backend dependencies...
    cd packages\backend && npm install --silent && cd ..\..
)
if not exist "packages\frontend\node_modules" (
    echo [setup] Installing frontend dependencies...
    cd packages\frontend && npm install --silent && cd ..\..
)

:: ── Backend .env ───────────────────────────────────────────────────────────────
if not exist "packages\backend\.env" (
    echo [setup] Creating .env from example...
    copy "packages\backend\.env.example" "packages\backend\.env" >nul
    echo   ⚠️  Review packages\backend\.env before production use.
)

:: ── Start both servers ────────────────────────────────────────────────────────
echo.
echo   Frontend ^→ http://localhost:3000
echo   Backend  ^→ http://localhost:5000
echo.
echo   Starting backend in a new window, frontend here.
echo   Close both windows to stop.
echo.

start "AllOne Garden — Backend" cmd /k "cd packages\backend && npm run dev"
cd packages\frontend && npm start
