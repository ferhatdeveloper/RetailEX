#Requires -Version 5.1
# Encoding: ASCII-only messages (PowerShell 5.1 + UTF-8 without BOM can break Turkish strings).
<#
  PostgreSQL (Windows): backup postgresql.conf + pg_hba.conf, allow remote listen + hba rule.
  Usage:
    .\pg-windows-expose-remote.ps1
    .\pg-windows-expose-remote.ps1 -PgData "C:\Program Files\PostgreSQL\16\data" -AllowCidr "10.0.0.0/8"
    .\pg-windows-expose-remote.ps1 -SkipFirewall -WhatIf
#>
param(
  [string]$PgData = $env:PGDATA,
  [string]$AllowCidr = "192.168.0.0/16",
  [int]$Port = 5432,
  [switch]$SkipFirewall,
  [switch]$WhatIf,
  <# Tum IPv4/IPv6 adreslerinden baglanti (kurulum / RetailEX install_pg16). Guvenlik: postgres sifresi guclu olmali; mumkunse VPN veya -AllowCidr ile alt ag kullanin. #>
  [switch]$AllowAllNetworks
)

$ErrorActionPreference = "Stop"

function Write-Info($m) { Write-Host "[PG-REMOTE] $m" -ForegroundColor Cyan }
function Write-Warn($m) { Write-Host "[PG-REMOTE] $m" -ForegroundColor Yellow }

function Find-DefaultPgData {
  $roots = @(
    "${env:ProgramFiles}\PostgreSQL",
    "${env:ProgramFiles(x86)}\PostgreSQL"
  ) | Where-Object { $_ -and (Test-Path $_) }

  $dataDirs = @()
  foreach ($r in $roots) {
    Get-ChildItem -Path $r -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $d = Join-Path $_.FullName "data"
      if (Test-Path (Join-Path $d "postgresql.conf")) { $dataDirs += $d }
    }
  }
  return $dataDirs | Select-Object -Unique
}

if ([string]::IsNullOrWhiteSpace($PgData)) {
  $found = @(Find-DefaultPgData)
  if ($found.Count -eq 1) {
    $PgData = $found[0]
    Write-Info "PGDATA auto: $PgData"
  }
  elseif ($found.Count -gt 1) {
    Write-Warn "Multiple data folders found; pass -PgData:"
    $found | ForEach-Object { Write-Host "  $_" }
    exit 1
  }
  else {
    Write-Warn "PGDATA not found. Example:"
    Write-Host '  .\pg-windows-expose-remote.ps1 -PgData "C:\Program Files\PostgreSQL\16\data" -AllowCidr "10.8.0.0/24"'
    exit 1
  }
}

$PgData = $PgData.TrimEnd('\')
$confPath = Join-Path $PgData "postgresql.conf"
$hbaPath  = Join-Path $PgData "pg_hba.conf"

if (-not (Test-Path $confPath)) { throw "postgresql.conf not found: $confPath" }
if (-not (Test-Path $hbaPath))  { throw "pg_hba.conf not found: $hbaPath" }

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$bakRoot = Join-Path $env:USERPROFILE "pg_config_backup\$stamp"
New-Item -ItemType Directory -Path $bakRoot -Force | Out-Null
Copy-Item -LiteralPath $confPath -Destination (Join-Path $bakRoot "postgresql.conf.bak") -Force
Copy-Item -LiteralPath $hbaPath  -Destination (Join-Path $bakRoot "pg_hba.conf.bak") -Force
Write-Info "Backup folder: $bakRoot"

if ($WhatIf) {
  Write-Info "WhatIf: no changes (listen_addresses and pg_hba line skipped)."
  exit 0
}

# postgresql.conf: listen_addresses = '*'
$lines = Get-Content -LiteralPath $confPath -Encoding UTF8
$out = New-Object System.Collections.Generic.List[string]
$replacedListen = $false
foreach ($line in $lines) {
  if ($line -match '^\s*#?\s*listen_addresses\s*=') {
    if (-not $replacedListen) {
      $out.Add("listen_addresses = '*'")
      $replacedListen = $true
    }
  }
  else {
    $out.Add($line)
  }
}
if (-not $replacedListen) {
  $out.Add("")
  $out.Add("listen_addresses = '*'")
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($confPath, $out.ToArray(), $utf8NoBom)
Write-Info "postgresql.conf: listen_addresses = '*'"

# pg_hba.conf: append once
$marker = "# --- RetailEX pg-windows-expose-remote (restore from backup to undo) ---"
$hbaText = [System.IO.File]::ReadAllText($hbaPath, [System.Text.Encoding]::UTF8)
if ($hbaText -notmatch [regex]::Escape($marker)) {
  if ($AllowAllNetworks) {
    $block = @"

$marker
host    all             all             0.0.0.0/0            scram-sha-256
host    all             all             ::/0                 scram-sha-256
"@
    Write-Info "pg_hba.conf: added 0.0.0.0/0 and ::/0 (all networks, scram-sha-256)."
  }
  else {
    $block = @"

$marker
host    all             all             $AllowCidr            scram-sha-256
"@
    Write-Info "pg_hba.conf: added host line for $AllowCidr (scram-sha-256)."
  }
  [System.IO.File]::AppendAllText($hbaPath, $block, $utf8NoBom)
}
else {
  Write-Warn "Marker already in pg_hba.conf; no new line added."
}

if (-not $SkipFirewall) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Write-Warn "Not admin: firewall rule skipped. Re-run elevated or use -SkipFirewall."
  }
  else {
    $ruleName = "PostgreSQL TCP $Port (RetailEX script)"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
      Write-Info "Firewall: inbound TCP $Port allowed."
    }
    else {
      Write-Info "Firewall rule already exists: $ruleName"
    }
  }
}

$services = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^postgresql' -or $_.DisplayName -match 'PostgreSQL' }
if ($services) {
  foreach ($s in $services) {
    try {
      Restart-Service -Name $s.Name -Force
      Write-Info "Service restarted: $($s.Name)"
    }
    catch {
      Write-Warn "Could not restart $($s.Name): $_ - restart manually in services.msc"
    }
  }
}
else {
  Write-Warn "No PostgreSQL Windows service found; restart PostgreSQL manually."
}

Write-Host ""
if ($AllowAllNetworks) {
  Write-Info "Done. Remote client: host=<this PC IP>, port=$Port, user/password. pg_hba: all IPv4/IPv6 (0.0.0.0/0, ::/0)."
}
else {
  Write-Info "Done. Remote client: host=<this PC IP>, port=$Port, user/password. pg_hba CIDR: $AllowCidr"
}
Write-Warn "Security: Use strong postgres password; on public Internet prefer VPN or narrow -AllowCidr instead of -AllowAllNetworks."
