# One-click production / local availability check for non-technical users.
# Usage: pnpm prod:health [--remote] [--url https://your-domain.com]
param(
  [switch]$Remote,
  [string]$Url = ""
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Load-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return @{} }
  $vars = @{}
  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^([^=]+)=(.*)$') {
      $vars[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
  return $vars
}

function Test-Endpoint {
  param(
    [string]$Name,
    [string]$Uri,
    [int]$TimeoutSec = 8,
    [scriptblock]$Validate = $null
  )
  try {
    $res = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec $TimeoutSec
    if ($Validate) {
      $body = $res.Content
      $ok = & $Validate $body $res.StatusCode
      if (-not $ok) {
        return @{ Name = $Name; Ok = $false; Detail = "Unexpected response from $Uri" }
      }
    }
    return @{ Name = $Name; Ok = $true; Detail = "HTTP $($res.StatusCode)" }
  } catch {
    return @{ Name = $Name; Ok = $false; Detail = $_.Exception.Message }
  }
}

$envVars = Load-DotEnv "$root\.env"
$productionUrl = $Url
if (-not $productionUrl) {
  $productionUrl = $envVars["PRODUCTION_URL"]
  if (-not $productionUrl) { $productionUrl = $envVars["WEB_ORIGIN"] }
}

$localMode = -not $Remote -and (-not $productionUrl -or $productionUrl -match 'localhost|127\.0\.0\.1')

Write-Host ""
Write-Host "=== CA Suite availability check ===" -ForegroundColor Cyan
if ($localMode) {
  Write-Host "Mode: local prod-sim (localhost)" -ForegroundColor Yellow
  $webBase = if ($envVars["E2E_WEB_PORT"]) { "http://localhost:$($envVars['E2E_WEB_PORT'])" } else { "http://localhost:5180" }
  $apiBase = "http://localhost:4000"
  $extractorPort = if ($envVars["EXTRACTOR_URL"] -match ':(\d+)') { $Matches[1] } else { "8011" }
  $extractorBase = "http://localhost:$extractorPort"
} else {
  Write-Host "Mode: remote production" -ForegroundColor Yellow
  Write-Host "URL:  $productionUrl"
  $webBase = $productionUrl.TrimEnd('/')
  $apiBase = $webBase
  $extractorBase = $null
}

$checks = @()

$checks += Test-Endpoint -Name "Web (login page)" -Uri "$webBase/login" -Validate {
  param($body) $body -match "CA Suite"
}

$checks += Test-Endpoint -Name "API health" -Uri "$apiBase/api/health" -Validate {
  param($body) try { ($body | ConvertFrom-Json).ok -eq $true } catch { $body -match '"ok"\s*:\s*true' }
}

if (-not $localMode) {
  $vpsApi = if ($envVars["VPS_HEALTH_URL"]) { $envVars["VPS_HEALTH_URL"] } else { "https://practice.planetfinance.cloud/api/health" }
  if ($vpsApi -ne "$apiBase/api/health") {
    $checks += Test-Endpoint -Name "VPS API (direct)" -Uri $vpsApi -Validate {
      param($body) try { ($body | ConvertFrom-Json).ok -eq $true } catch { $body -match '"ok"\s*:\s*true' }
    }
  }
}

if ($extractorBase) {
  $checks += Test-Endpoint -Name "Extractor health" -Uri "$extractorBase/health" -Validate {
    param($body) try { ($body | ConvertFrom-Json).PSObject.Properties.Name -contains "invoice2data" } catch { $false }
  }
}

$failed = @($checks | Where-Object { -not $_.Ok })
$passed = @($checks | Where-Object { $_.Ok })

Write-Host ""
foreach ($c in $checks) {
  $icon = if ($c.Ok) { "[OK]" } else { "[FAIL]" }
  $color = if ($c.Ok) { "Green" } else { "Red" }
  Write-Host "$icon $($c.Name): $($c.Detail)" -ForegroundColor $color
}

Write-Host ""
if ($failed.Count -eq 0) {
  Write-Host "All checks passed. App is available at $webBase" -ForegroundColor Green
  exit 0
}

Write-Host "$($failed.Count) check(s) failed." -ForegroundColor Red
if ($localMode) {
  Write-Host ""
  Write-Host "To start the local stack, run:" -ForegroundColor Yellow
  Write-Host "  pnpm dev:prod-sim"
} else {
  Write-Host ""
  Write-Host "Ask Cursor to inspect Vercel deployments (MCP) or VPS Docker logs." -ForegroundColor Yellow
  Write-Host "Set PRODUCTION_URL in .env for future checks."
}
exit 1
