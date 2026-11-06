<#
.SYNOPSIS
    Official 1-Line Native Windows Installer for Antigravity Account Switcher.
.DESCRIPTION
    Zero-dependency installer. Automatically downloads, links, and hot-reloads
    Antigravity Account Switcher into Google Antigravity 2.0 without requiring npm or git.
.EXAMPLE
    irm https://raw.githubusercontent.com/omid-io/antigravity-account-switcher/master/install.ps1 | iex
#>

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "  🌌 Antigravity Account Switcher • Installer" -ForegroundColor Cyan
Write-Host "  ──────────────────────────────────────────" -ForegroundColor DarkGray

$pluginsDir = Join-Path $HOME ".gemini\config\plugins"
$targetDir  = Join-Path $pluginsDir "antigravity-account-switcher"
$repoZipUrl = "https://github.com/omid-io/antigravity-account-switcher/archive/refs/heads/master.zip"
$tempZip    = Join-Path $env:TEMP "antigravity-account-switcher-master.zip"
$tempExtract= Join-Path $env:TEMP "agy-switcher-extract"

# 1. Prepare Target Directories
if (-not (Test-Path $pluginsDir)) {
    New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null
}

Write-Host "  ⏳ Downloading latest release from GitHub..." -ForegroundColor Yellow
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13
    Invoke-WebRequest -Uri $repoZipUrl -OutFile $tempZip -UseBasicParsing
} catch {
    Write-Host "  ❌ Failed to download archive: $_" -ForegroundColor Red
    exit 1
}

# 2. Extract Archive
Write-Host "  📦 Extracting plugin files..." -ForegroundColor Yellow
if (Test-Path $tempExtract) {
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
}
Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

$extractedFolder = Join-Path $tempExtract "antigravity-account-switcher-master"
if (-not (Test-Path $extractedFolder)) {
    Write-Host "  ❌ Extraction folder not found." -ForegroundColor Red
    exit 1
}

# 3. Deploy to Antigravity Plugins Directory
Write-Host "  ⚡ Installing to $targetDir..." -ForegroundColor Yellow
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

# Copy files preserving profiles if present
Get-ChildItem -Path $extractedFolder | ForEach-Object {
    $dest = Join-Path $targetDir $_.Name
    if ($_.Name -eq "profiles" -and (Test-Path $dest)) {
        # Keep existing saved accounts intact
        return
    }
    Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
}

# Cleanup Temporary Files
Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

# 4. Trigger Live Window Hot-Reload if Antigravity is Running
$portFile = Join-Path ($env:APPDATA) "Antigravity\DevToolsActivePort"
if (Test-Path $portFile) {
    try {
        $port = (Get-Content $portFile | Select-Object -First 1).Trim()
        if ($port -match '^\d+$') {
            Write-Host "  🔄 Detected active Antigravity session on port $port, triggering live reload..." -ForegroundColor Magenta
            $installScript = Join-Path $targetDir "scripts\install-plugin.js"
            if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path $installScript)) {
                Start-Process node -ArgumentList "`"$installScript`"" -NoNewWindow -Wait
            }
        }
    } catch {
        # Non-fatal if Antigravity is not active
    }
}

Write-Host "  ──────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  ✅ Antigravity Account Switcher installed successfully!" -ForegroundColor Green
Write-Host "  💡 Open Antigravity 2.0 to use the switcher opposite Settings." -ForegroundColor White
Write-Host ""
