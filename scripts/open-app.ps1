# Start CA Suite locally if needed, then open the app in the default browser.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$health = & powershell -NoProfile -File "$root\scripts\production-health.ps1" 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Host ""
  Write-Host "Starting local stack (first run may take ~30 seconds)..." -ForegroundColor Yellow
  & powershell -NoProfile -File "$root\scripts\launch-prod-sim.ps1"
  Start-Sleep -Seconds 20
  & powershell -NoProfile -File "$root\scripts\production-health.ps1"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Could not start the app. Ask Cursor to check the logs." -ForegroundColor Red
    exit 1
  }
}

$envVars = @{}
if (Test-Path "$root\.env") {
  Get-Content "$root\.env" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$' -and $_ -notmatch '^\s*#') {
      $envVars[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
}
$port = if ($envVars["E2E_WEB_PORT"]) { $envVars["E2E_WEB_PORT"] } else { "5180" }
$url = "http://localhost:$port/login"

Write-Host ""
Write-Host "Opening $url" -ForegroundColor Green
Start-Process $url
