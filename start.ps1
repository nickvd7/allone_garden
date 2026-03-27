# =============================================================================
# AllOne Garden — Windows development starter (PowerShell)
# Run from the project root: .\start.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

$Green  = "`e[32m"
$Yellow = "`e[33m"
$Reset  = "`e[0m"

Write-Host ""
Write-Host "${Green}  🌱  AllOne Garden — Development Mode (Windows)${Reset}"
Write-Host ""

# ── Node.js check ──────────────────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌  Node.js not found."
    Write-Host "    Download from https://nodejs.org (LTS version)"
    exit 1
}

$nodeVersion = node -e "process.stdout.write(process.version.slice(1).split('.')[0])"
if ([int]$nodeVersion -lt 18) {
    Write-Host "❌  Node.js 18 or higher required (found v$nodeVersion)"
    Write-Host "    Download from https://nodejs.org"
    exit 1
}

Write-Host "✅  Node.js v$(node --version) found"

# ── Install dependencies ───────────────────────────────────────────────────────
function Install-IfNeeded($dir) {
    if (-not (Test-Path "$dir\node_modules")) {
        Write-Host "${Yellow}[setup]${Reset} Installing dependencies in $dir..."
        Push-Location $dir
        npm install --silent
        Pop-Location
    }
}

Install-IfNeeded "."
Install-IfNeeded "packages\backend"
Install-IfNeeded "packages\frontend"

# ── Backend .env ───────────────────────────────────────────────────────────────
if (-not (Test-Path "packages\backend\.env")) {
    Write-Host "${Yellow}[setup]${Reset} Creating .env from example..."
    Copy-Item "packages\backend\.env.example" "packages\backend\.env"
    Write-Host "  ⚠️  Review packages\backend\.env before production use."
}

# ── Start ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Frontend → http://localhost:3000"
Write-Host "  Backend  → http://localhost:5000"
Write-Host "  Health   → http://localhost:5000/health"
Write-Host ""
Write-Host "  Press Ctrl+C to stop."
Write-Host ""

# Check for concurrently
$hasConcurrently = $null -ne (Get-Command npx -ErrorAction SilentlyContinue) -and
    (npx concurrently --version 2>$null)

if ($hasConcurrently) {
    npx concurrently `
        --names "backend,frontend" `
        --prefix-colors "green,cyan" `
        "cd packages\backend && npm run dev" `
        "cd packages\frontend && npm start"
} else {
    Write-Host "Starting backend in background..."
    $backend = Start-Process -FilePath "cmd" `
        -ArgumentList "/c cd packages\backend && npm run dev" `
        -PassThru -WindowStyle Normal

    Write-Host "Starting frontend..."
    try {
        Set-Location "packages\frontend"
        npm start
    } finally {
        Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
        Set-Location $PSScriptRoot
    }
}
