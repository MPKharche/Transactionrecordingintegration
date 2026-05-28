# Prod-simulated local stack: constrained profile + full pipeline (infra via Docker).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Get-Content "$root\.env" | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  if ($_ -match '^([^=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

$env:DATABASE_URL = "postgresql://ca_user:ca_pass@localhost:5433/ca_saas"
$env:REDIS_HOST = "localhost"
$env:REDIS_PORT = "6379"
$env:MINIO_ENDPOINT = "localhost"
$env:DEPLOY_PROFILE = "constrained"
$env:AUTH_DEV_BYPASS = "true"
$env:VITE_ALLOW_DEV_LOGIN = "true"
$env:NODE_ENV = "development"

function Test-IsCaExtractor([int]$Port) {
  try {
    $h = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 2
    return ($null -ne $h -and $h.PSObject.Properties.Name -contains "invoice2data" -and $h.PSObject.Properties.Name -contains "openrouter")
  } catch {
    return $false
  }
}

function Test-PortInUse([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

# Prefer 8011 — port 8001 is often occupied by unrelated local services on Windows dev machines.
$extractorCandidates = @(8011, 8000, 8001)
$extractorPort = $null
foreach ($p in $extractorCandidates) {
  if (Test-IsCaExtractor $p) {
    $extractorPort = $p
    break
  }
}
if (-not $extractorPort) {
  $extractorPort = ($extractorCandidates | Where-Object { -not (Test-PortInUse $_) } | Select-Object -First 1)
}
if (-not $extractorPort) {
  throw "Could not find a free extractor port. Tried: $($extractorCandidates -join ', ')"
}
$env:EXTRACTOR_URL = "http://localhost:$extractorPort"

Write-Host "==> Docker infra (postgres, redis, minio)"
docker compose -f infra/docker-compose.yml up -d postgres redis minio
Start-Sleep -Seconds 8

Write-Host "==> DB + queue"
pnpm db:push
pnpm db:seed
pnpm queue:flush

$webPort = if ($env:E2E_WEB_PORT) { $env:E2E_WEB_PORT } else { "5180" }
$env:WEB_ORIGIN = "http://localhost:$webPort"
$env:E2E_WEB_PORT = $webPort

foreach ($p in 4000, $webPort) {
  Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Host "==> Starting API + Web on port $webPort (background)"
Start-Process powershell -WindowStyle Minimized -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root'; `$env:DATABASE_URL='$env:DATABASE_URL'; `$env:AUTH_DEV_BYPASS='true'; `$env:VITE_ALLOW_DEV_LOGIN='true'; `$env:WEB_ORIGIN='http://localhost:$webPort'; pnpm --filter @ca-suite/api dev"
)
Start-Process powershell -WindowStyle Minimized -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root'; `$env:VITE_ALLOW_DEV_LOGIN='true'; pnpm --filter @ca-suite/web dev -- --port $webPort --strictPort"
)

Write-Host "==> Starting Worker (background)"
Start-Process powershell -WindowStyle Minimized -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root'; Get-Content '$root\.env' | ForEach-Object { if (`$_ -match '^([^#=][^=]*)=(.*)$') { Set-Item env:`$(`$matches[1].Trim()) `$matches[2].Trim() } }; `$env:DATABASE_URL='$env:DATABASE_URL'; `$env:DEPLOY_PROFILE='constrained'; `$env:EXTRACTOR_URL='$env:EXTRACTOR_URL'; pnpm --filter @ca-suite/worker dev"
)

if (-not (Test-IsCaExtractor $extractorPort)) {
  if (Test-PortInUse $extractorPort) {
    throw "Port $extractorPort is occupied by a non-CA extractor service. Free that port or set another candidate."
  }
  Write-Host "==> Starting Extractor on :$extractorPort (background)"
  Start-Process powershell -WindowStyle Minimized -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root\services\extractor'; Get-Content '$root\.env' | ForEach-Object { if (`$_ -match '^([^=]+)=(.*)$') { Set-Item env:`$(`$matches[1].Trim()) `$matches[2].Trim() } }; python -m uvicorn app:app --host 127.0.0.1 --port $extractorPort"
  )
}

Write-Host "Waiting for services..."
Start-Sleep -Seconds 15
$api = Invoke-RestMethod -Uri "http://localhost:4000/api/health" -TimeoutSec 5
$ext = Invoke-RestMethod -Uri "http://localhost:$extractorPort/health" -TimeoutSec 5
if ($ext.PSObject.Properties.Name -notcontains "invoice2data") {
  throw "Port $extractorPort responded to /health but is not CA extractor."
}
$loginHtml = (Invoke-WebRequest -Uri "http://localhost:$webPort/login" -UseBasicParsing -TimeoutSec 5).Content
if ($loginHtml -notmatch "CA Suite") {
  throw "Port $webPort is not serving CA Suite (another app may own this port). Set E2E_WEB_PORT and retry."
}
Write-Host "API:" ($api | ConvertTo-Json -Compress)
Write-Host "Extractor openrouter:" $ext.openrouter
Write-Host "Extractor URL:" $env:EXTRACTOR_URL
Write-Host ""
Write-Host "Web:  http://localhost:$webPort  (Dev login)"
Write-Host "API:  http://localhost:4000/api/health"
Write-Host "Run:  pnpm test:regression"
