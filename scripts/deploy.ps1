# One-click production deploy (Windows PowerShell). Requires Docker Desktop + .env.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path ".env")) {
  Write-Error "Missing .env — run: .\scripts\setup-env.ps1"
}

$deployTarget = "standalone"
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*DEPLOY_TARGET\s*=\s*(.+)\s*$') { $deployTarget = $Matches[1].Trim() }
}

if ($deployTarget -eq "vps") {
  $env:COMPOSE_FILE = "infra/docker-compose.yml;infra/docker-compose.vps.yml"
  $appUrl = "http://127.0.0.1:3080"
} else {
  $env:COMPOSE_FILE = "infra/docker-compose.yml"
  $appUrl = "http://127.0.0.1"
}

$compose = @("compose", "-f", $env:COMPOSE_FILE, "--env-file", ".env")

Write-Host "==> Profile: DEPLOY_TARGET=$deployTarget  health=$appUrl"
& docker @compose build --parallel
& docker @compose up -d postgres redis minio
for ($i = 1; $i -le 25; $i++) {
  & docker @compose exec -T postgres pg_isready -U ca_user -d ca_saas -q 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
}
& docker @compose --profile tools build db-migrate
& docker @compose --profile tools run --rm db-migrate
& docker @compose up -d extractor api worker web nginx

$ok = $false
for ($i = 1; $i -le 15; $i++) {
  try {
    Invoke-WebRequest -Uri "$appUrl/api/health" -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Host "    API OK — $appUrl/api/health"
    $ok = $true
    break
  } catch { Start-Sleep -Seconds 4 }
}
if (-not $ok) { Write-Warning "API health failed — docker compose logs api" }
Write-Host "==> Deploy complete"
