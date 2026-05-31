# Create .env from template with generated secrets (Windows).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path ".env.production.example")) { Write-Error "Missing .env.production.example" }
if (Test-Path ".env") { Write-Host ".env already exists."; exit 0 }

function New-Hex([int]$n = 16) {
  -join (1..$n | ForEach-Object { "{0:x2}" -f (Get-Random -Maximum 256) })
}

Copy-Item ".env.production.example" ".env"
$c = Get-Content ".env" -Raw
$c = $c -replace '(?m)^POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$(New-Hex 16)"
$c = $c -replace '(?m)^AUTH_SECRET=.*', "AUTH_SECRET=$(New-Hex 32)"
$c = $c -replace '(?m)^EXTRACTOR_SHARED_SECRET=.*', "EXTRACTOR_SHARED_SECRET=$(New-Hex 24)"
$c = $c -replace '(?m)^MINIO_ACCESS_KEY=.*', "MINIO_ACCESS_KEY=$(New-Hex 16)"
$c = $c -replace '(?m)^MINIO_SECRET_KEY=.*', "MINIO_SECRET_KEY=$(New-Hex 24)"
if ($c -match '(?m)^POSTGRES_PASSWORD=(.+)$') {
  $pg = $Matches[1].Trim()
  $c = $c -replace '(?m)^DATABASE_URL=.*', "DATABASE_URL=postgresql://ca_user:${pg}@postgres:5432/ca_saas"
}
Set-Content ".env" $c.TrimEnd()
Write-Host "Created .env — set API_PUBLIC_URL, GOOGLE_*, OPENROUTER_API_KEY, DEPLOY_TARGET"
Write-Host "Then: .\scripts\deploy.ps1"
