# CA Suite — local development startup (Windows/PowerShell)
# Requires: Docker Desktop, pnpm, Node 22

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "`n[CA Suite] Starting local dev environment..." -ForegroundColor Cyan

# 1. Copy env file if missing
if (-not (Test-Path "$root\.env")) {
    Copy-Item "$root\.env.example" "$root\.env"
    Write-Host "[env] Created .env from .env.example — fill in secrets!" -ForegroundColor Yellow
}

# 2. Start infrastructure (postgres, redis, minio only)
Write-Host "[docker] Starting postgres, redis, minio..." -ForegroundColor Cyan
Set-Location "$root\infra"
docker compose up -d postgres redis minio

# 3. Wait for postgres
Write-Host "[docker] Waiting for postgres to be ready..."
Start-Sleep -Seconds 5

# 4. Install pnpm deps
Write-Host "[pnpm] Installing dependencies..." -ForegroundColor Cyan
Set-Location $root
pnpm install

# 5. Run DB migrations
Write-Host "[db] Running Drizzle migrations..." -ForegroundColor Cyan
$env:DATABASE_URL = "postgresql://ca_user:ca_pass@localhost:5432/ca_saas"
pnpm db:migrate

# 6. Start all apps in parallel
Write-Host "[dev] Starting web, worker, extractor..." -ForegroundColor Green
Write-Host "      Web    -> http://localhost:3000"
Write-Host "      Worker -> background BullMQ consumer"
Write-Host "      Extractor -> http://localhost:8000"
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; pnpm --filter @ca-saas/web dev" -WindowStyle Normal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; pnpm --filter @ca-saas/worker dev" -WindowStyle Normal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\services\extractor'; python -m uvicorn app:app --reload --port 8000" -WindowStyle Normal

Write-Host "[CA Suite] Dev environment started!" -ForegroundColor Green
