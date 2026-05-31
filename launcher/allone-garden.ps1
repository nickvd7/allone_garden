#Requires -Version 5.1
<#
.SYNOPSIS  AllOne Garden Launcher for Windows
.NOTES     https://github.com/nickvd7/allone_garden
           Requires: Git, Node.js 20+
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$REPO_URL    = 'https://github.com/nickvd7/allone_garden.git'
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA 'AllOneGarden\game'
$CONFIG_DIR  = Join-Path $env:LOCALAPPDATA 'AllOneGarden'
$CONFIG_FILE = Join-Path $CONFIG_DIR 'config.json'
$MIN_NODE    = 20

function Show-Banner {
    Clear-Host
    Write-Host ''
    Write-Host '  ╔══════════════════════════════════════════════╗' -ForegroundColor Green
    Write-Host '  ║   🌱  AllOne Garden — Launcher               ║' -ForegroundColor Green
    Write-Host '  ║   Open-source multiplayer gardening game     ║' -ForegroundColor Green
    Write-Host '  ╚══════════════════════════════════════════════╝' -ForegroundColor Green
    Write-Host ''
}

function Assert-Prerequisites {
    $ok = $true
    Write-Host '  Checking requirements...' -ForegroundColor Gray

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host '  ✗ git not found — install from https://git-scm.com' -ForegroundColor Red
        $ok = $false
    } else {
        Write-Host ('  ✓ git ' + (git --version).Split(' ')[-1]) -ForegroundColor Green
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "  ✗ Node.js not found — install v${MIN_NODE}+ from https://nodejs.org" -ForegroundColor Red
        $ok = $false
    } else {
        $verStr = (node --version).TrimStart('v')
        $major  = [int]($verStr.Split('.')[0])
        if ($major -lt $MIN_NODE) {
            Write-Host "  ✗ Node.js v$verStr found — need v${MIN_NODE}+" -ForegroundColor Red
            $ok = $false
        } else {
            Write-Host "  ✓ Node.js v$verStr" -ForegroundColor Green
        }
    }

    if (-not $ok) {
        Write-Host ''
        Write-Host '  Install the missing tools and run this launcher again.' -ForegroundColor Yellow
        Read-Host '  Press Enter to exit'
        exit 1
    }
    Write-Host ''
}

function Sync-Repo {
    if (Test-Path (Join-Path $INSTALL_DIR '.git')) {
        Write-Host '  🔄 Updating game files...' -ForegroundColor Cyan
        & git -C $INSTALL_DIR pull --ff-only origin main 2>&1 | Out-Null
    } else {
        Write-Host '  📥 Downloading AllOne Garden...' -ForegroundColor Cyan
        New-Item -ItemType Directory -Path (Split-Path $INSTALL_DIR) -Force | Out-Null
        & git clone --depth 1 $REPO_URL $INSTALL_DIR
    }

    Write-Host '  📦 Installing dependencies...' -ForegroundColor Cyan
    & npm --prefix $INSTALL_DIR install --silent --ignore-scripts 2>&1 | Out-Null
    Write-Host '  ✓ Ready' -ForegroundColor Green
    Write-Host ''
}

function Get-OrCreateConfig {
    New-Item -ItemType Directory -Path $CONFIG_DIR -Force | Out-Null

    if (-not (Test-Path $CONFIG_FILE)) {
        $secret = & node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"
        $cfg    = [pscustomobject]@{ jwtSecret = $secret; serverName = 'My Garden'; port = 5000 }
        $cfg | ConvertTo-Json | Set-Content -Path $CONFIG_FILE -Encoding UTF8
        # Restrict file to current user only
        $acl = Get-Acl $CONFIG_FILE
        $acl.SetAccessRuleProtection($true, $false)
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
            'FullControl', 'Allow')
        $acl.AddAccessRule($rule)
        Set-Acl -Path $CONFIG_FILE -AclObject $acl
    }

    $cfg = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json

    # Re-generate secret if missing or short
    if (-not $cfg.jwtSecret -or $cfg.jwtSecret.Length -lt 32) {
        $cfg.jwtSecret = & node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"
        $cfg | ConvertTo-Json | Set-Content -Path $CONFIG_FILE -Encoding UTF8
    }

    return $cfg
}

function Save-ServerName([string]$Name) {
    $cfg = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json
    $cfg.serverName = $Name
    $cfg | ConvertTo-Json | Set-Content -Path $CONFIG_FILE -Encoding UTF8
}

function Get-LanIP {
    try {
        $ip = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp -ErrorAction SilentlyContinue |
               Select-Object -First 1).IPAddress
        return if ($ip) { $ip } else { '127.0.0.1' }
    } catch { return '127.0.0.1' }
}

function Wait-ForBackend([int]$Port) {
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $r = Invoke-WebRequest "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
    }
    return $false
}

function Start-LocalMode {
    Write-Host ''
    Write-Host '  🏠 Starting locally — solo or LAN play' -ForegroundColor Green
    Write-Host ''

    $cfg    = Get-OrCreateConfig
    $port   = $cfg.port
    $dbPath = Join-Path $CONFIG_DIR 'garden.db'
    $backendDir = Join-Path $INSTALL_DIR 'packages\backend'

    # Set env vars in current session so they're inherited by background job
    $env:NODE_ENV     = 'production'
    $env:PORT         = "$port"
    $env:FRONTEND_URL = "http://localhost:$port"
    $env:JWT_SECRET   = $cfg.jwtSecret
    $env:SQLITE_PATH  = $dbPath
    $env:ELECTRON_MODE = '1'
    $env:SERVER_NAME  = $cfg.serverName

    $job = Start-Job -ScriptBlock {
        param($dir, $env)
        foreach ($k in $env.Keys) { [System.Environment]::SetEnvironmentVariable($k, $env[$k]) }
        Set-Location $dir
        & node src/index.js
    } -ArgumentList $backendDir, @{
        NODE_ENV     = $env:NODE_ENV
        PORT         = $env:PORT
        FRONTEND_URL = $env:FRONTEND_URL
        JWT_SECRET   = $env:JWT_SECRET
        SQLITE_PATH  = $env:SQLITE_PATH
        ELECTRON_MODE = $env:ELECTRON_MODE
        SERVER_NAME  = $env:SERVER_NAME
    }

    if (Wait-ForBackend $port) {
        Write-Host "  ✓ Server running at http://localhost:$port" -ForegroundColor Green
        Start-Process "http://localhost:$port"
        Write-Host ''
        Write-Host '  Close this window (or press Ctrl+C) to stop the server.' -ForegroundColor Yellow
        Receive-Job -Job $job -Wait | Out-Null
    } else {
        Write-Host '  ✗ Server failed to start.' -ForegroundColor Red
        Stop-Job $job
    }

    Read-Host '  Press Enter to exit'
}

function Start-OnlineMode {
    Write-Host ''
    Write-Host '  🌐 Connect to an existing server' -ForegroundColor Cyan
    Write-Host ''
    $url = (Read-Host '  Server URL (e.g. https://garden.example.com)').Trim()

    # Only allow http:// and https:// — prevent file://, javascript:, etc.
    if ($url -notmatch '^https?://[a-zA-Z0-9]') {
        Write-Host '  ✗ Invalid URL. Must start with http:// or https://' -ForegroundColor Red
        Read-Host '  Press Enter to return'
        return
    }

    Write-Host '  🚀 Opening in your browser...' -ForegroundColor Green
    Start-Process $url
    Read-Host '  Press Enter to exit'
}

function Start-HostMode {
    Write-Host ''
    Write-Host '  🖥️  Host a server — others can connect' -ForegroundColor Cyan
    Write-Host ''

    $cfg   = Get-OrCreateConfig
    $lanIP = Get-LanIP
    $port  = $cfg.port

    $newName = (Read-Host "  Server name [$($cfg.serverName)]").Trim()
    if ($newName) {
        $cfg.serverName = $newName
        Save-ServerName $newName
    }

    $dbPath = Join-Path $CONFIG_DIR 'garden.db'
    $backendDir = Join-Path $INSTALL_DIR 'packages\backend'

    Write-Host ''
    Write-Host '  ─────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host "  Server : $($cfg.serverName)"
    Write-Host "  Port   : $port"
    Write-Host "  LAN    : http://${lanIP}:${port}" -ForegroundColor Cyan
    Write-Host "  WAN    : http://YOUR-PUBLIC-IP:${port}  (+ port forwarding)" -ForegroundColor Yellow
    Write-Host '  ─────────────────────────────────────────────' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  ⚠️  For public internet access, use HTTPS via a reverse proxy.' -ForegroundColor Yellow
    Write-Host '     See SECURITY_HARDENING.md for production guidance.' -ForegroundColor Gray
    Write-Host ''

    $env:NODE_ENV     = 'production'
    $env:PORT         = "$port"
    $env:FRONTEND_URL = "http://${lanIP}:${port}"
    $env:JWT_SECRET   = $cfg.jwtSecret
    $env:SQLITE_PATH  = $dbPath
    $env:ELECTRON_MODE = '1'
    $env:SERVER_NAME  = $cfg.serverName

    Write-Host "  🌱 Starting '$($cfg.serverName)' — Ctrl+C to stop" -ForegroundColor Green
    Write-Host ''
    Push-Location $backendDir
    & node src/index.js
    Pop-Location
}

# ── Main ──────────────────────────────────────────────────────────────────────
Show-Banner
Assert-Prerequisites
Sync-Repo
Show-Banner

Write-Host '  How do you want to play?' -ForegroundColor White
Write-Host ''
Write-Host '  [1]  🏠  Play locally   — solo or LAN, no internet required' -ForegroundColor Cyan
Write-Host '  [2]  🌐  Play online    — join an existing server'            -ForegroundColor Cyan
Write-Host '  [3]  🖥️   Host a server  — let others join from LAN or internet' -ForegroundColor Cyan
Write-Host '  [q]  Exit'                                                     -ForegroundColor Gray
Write-Host ''

$choice = (Read-Host '  Choice [1/2/3/q]').Trim()
switch ($choice) {
    '1' { Start-LocalMode }
    '2' { Start-OnlineMode }
    '3' { Start-HostMode }
    { $_ -in 'q','Q' } { exit 0 }
    default { Write-Host '  Invalid choice.' -ForegroundColor Red; Start-Sleep 2 }
}
