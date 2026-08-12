#Requires -Version 5.1
<#
.SYNOPSIS
  Berzin / Sho Aksesuar / Küpeli: kiracı DB + merkez_db tenant + 000_master_schema (+ isteğe bağlı demo, admin şifresi, PG rolü).

.DESCRIPTION
  1) npm run db:merkez:tenant-retail-seed (CREATE DATABASE + tenant_registry)
  2) psql: her kiracıya database/migrations/000_master_schema.sql
     → Varsayılan giriş: kullanıcı admin, şifre admin (000 içi seed)
  3) İsteğe bağlı: 001_demo_data.sql (-DemoData)
  4) Node: mudur + kasiyer (public.users, firma 001); şifre: -TenantUserPassword veya geçici admin
  5) İsteğe bağlı: -AppAdminPassword → admin şifresini değiştirir
  6) İsteğe bağlı: -TenantPgRolePassword → PostgreSQL LOGIN rolü (varsayılan retailex_store) + şema yetkileri

  Şifreleri repoya yazmayın.

.EXAMPLE
  cd D:\RetailEX
  .\scripts\merkez-tenant-retail-full-setup.ps1 -PgPassword '...' -PgHost '72.60.182.107' `
    -TenantUserPassword 'MagazaPersonelSifresi' `
    -AppAdminPassword 'GucluAdminSifre' -DemoData `
    -TenantPgRolePassword 'GucluRolSifre' -TenantPgRoleName 'retailex_store'
#>
[CmdletBinding()]
param(
  [string] $PgHost = '72.60.182.107',
  [int] $PgPort = 5432,
  [string] $PgUser = 'postgres',
  [Parameter(Mandatory = $false)]
  [string] $PgPassword = '',
  [string] $MerkezDatabase = 'merkez_db',
  [string] $MaintenanceDatabase = 'postgres',
  [string] $PsqlPath = '',
  [switch] $SkipSchema,
  [switch] $SkipCreateDbs,
  [switch] $DemoData,
  [Parameter(Mandatory = $false)]
  [string] $TenantUserPassword = '',
  [Parameter(Mandatory = $false)]
  [string] $AppAdminPassword = '',
  [Parameter(Mandatory = $false)]
  [string] $TenantPgRolePassword = '',
  [string] $TenantPgRoleName = 'retailex_store'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$MasterSql = Join-Path $RepoRoot 'database\migrations\000_master_schema.sql'
$DemoSql = Join-Path $RepoRoot 'database\migrations\001_demo_data.sql'
if (-not (Test-Path -LiteralPath $MasterSql)) {
  throw "Bulunamadi: $MasterSql"
}

$plainPass = $PgPassword
if ([string]::IsNullOrWhiteSpace($plainPass)) {
  $plainPass = [string]$env:PGPASSWORD
}
if ([string]::IsNullOrWhiteSpace($plainPass)) {
  throw 'PgPassword parametresi veya PGPASSWORD ortam degiskeni gerekli.'
}

$env:PGHOST = $PgHost
$env:PGPORT = "$PgPort"
$env:PGUSER = $PgUser
$env:PGPASSWORD = $plainPass
$env:PGDATABASE = $MerkezDatabase
$env:PG_MAINTENANCE_DATABASE = $MaintenanceDatabase
if ($SkipCreateDbs) {
  $env:SKIP_CREATE_DBS = '1'
} else {
  Remove-Item Env:\SKIP_CREATE_DBS -ErrorAction SilentlyContinue
}

Write-Host "== 1/4 Node: kiracı DB + merkez_db tenant_registry ==" -ForegroundColor Cyan
Push-Location $RepoRoot
try {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm PATH''te yok.'
  }
  npm run db:merkez:tenant-retail-seed
  if ($LASTEXITCODE -ne 0) { throw "npm cikis kodu: $LASTEXITCODE" }
} finally {
  Pop-Location
}

if ($SkipSchema) {
  Write-Host "SkipSchema: master sema ve sonraki adimlar atlandi." -ForegroundColor Yellow
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  exit 0
}

$psql = $PsqlPath
if ([string]::IsNullOrWhiteSpace($psql)) {
  $candidates = @(
    (Join-Path ${env:ProgramFiles} 'PostgreSQL\16\bin\psql.exe'),
    (Join-Path ${env:ProgramFiles} 'PostgreSQL\17\bin\psql.exe'),
    (Join-Path ${env:ProgramFiles} 'PostgreSQL\15\bin\psql.exe')
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { $psql = $c; break }
  }
}
if (-not (Test-Path -LiteralPath $psql)) {
  throw "psql bulunamadi. PostgreSQL kurun veya -PsqlPath 'C:\Program Files\PostgreSQL\16\bin\psql.exe' verin."
}

$tenantDbs = @('berzin_com', 'sho_aksesuar', 'kupeli')
Write-Host "== 2/4 psql: her kiraciya 000_master_schema.sql ($psql) ==" -ForegroundColor Cyan
Write-Host "     (Varsayilan giris: admin / admin)" -ForegroundColor DarkGray

foreach ($db in $tenantDbs) {
  Write-Host "--- $db ---" -ForegroundColor Green
  & $psql -h $PgHost -p $PgPort -U $PgUser -d $db -v ON_ERROR_STOP=1 -f $MasterSql
  if ($LASTEXITCODE -ne 0) { throw "psql $db cikis kodu: $LASTEXITCODE" }
}

if ($DemoData) {
  if (-not (Test-Path -LiteralPath $DemoSql)) {
    throw "Bulunamadi: $DemoSql"
  }
  Write-Host "== 2b psql: 001_demo_data.sql (her kiraci) ==" -ForegroundColor Cyan
  foreach ($db in $tenantDbs) {
    Write-Host "--- demo $db ---" -ForegroundColor Green
    & $psql -h $PgHost -p $PgPort -U $PgUser -d $db -v ON_ERROR_STOP=1 -f $DemoSql
    if ($LASTEXITCODE -ne 0) { throw "psql demo $db cikis kodu: $LASTEXITCODE" }
  }
}

Write-Host "== 3/4 Node: mudur + kasiyer (her kiraci DB) ==" -ForegroundColor Cyan
$env:PGPASSWORD = $plainPass
$env:TENANT_DBS = ($tenantDbs -join ',')
Remove-Item Env:\TENANT_USER_PASSWORD -ErrorAction SilentlyContinue
if (-not [string]::IsNullOrWhiteSpace($TenantUserPassword)) {
  $env:TENANT_USER_PASSWORD = $TenantUserPassword
}
Push-Location $RepoRoot
try {
  node scripts/tenant-databases-ensure-app-users.mjs
  if ($LASTEXITCODE -ne 0) { throw "ensure-app-users cikis kodu: $LASTEXITCODE" }
} finally {
  Pop-Location
  Remove-Item Env:\TENANT_USER_PASSWORD -ErrorAction SilentlyContinue
}

$needPost = -not [string]::IsNullOrWhiteSpace($AppAdminPassword) -or -not [string]::IsNullOrWhiteSpace($TenantPgRolePassword)
if ($needPost) {
  Write-Host "== 4/4 Node: admin sifresi ve/veya PostgreSQL uygulama rolu ==" -ForegroundColor Cyan
  $env:PGPASSWORD = $plainPass
  $env:TENANT_DBS = ($tenantDbs -join ',')
  Remove-Item Env:\APP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\PG_APP_ROLE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\PG_APP_ROLE_NAME -ErrorAction SilentlyContinue
  if (-not [string]::IsNullOrWhiteSpace($AppAdminPassword)) {
    $env:APP_ADMIN_PASSWORD = $AppAdminPassword
  }
  if (-not [string]::IsNullOrWhiteSpace($TenantPgRolePassword)) {
    $env:PG_APP_ROLE_PASSWORD = $TenantPgRolePassword
    $env:PG_APP_ROLE_NAME = $TenantPgRoleName
  }
  Push-Location $RepoRoot
  try {
    node scripts/tenant-databases-post-schema.mjs
    if ($LASTEXITCODE -ne 0) { throw "post-schema cikis kodu: $LASTEXITCODE" }
  } finally {
    Pop-Location
    Remove-Item Env:\APP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PG_APP_ROLE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\PG_APP_ROLE_NAME -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "== 4/4 atlandi (AppAdminPassword / TenantPgRolePassword yok) ==" -ForegroundColor DarkGray
}

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
Write-Host "Tamam: DB + tenant + master sema + mudur/kasiyer" -NoNewline -ForegroundColor Green
if ($DemoData) { Write-Host " + demo veri" -NoNewline -ForegroundColor Green }
if ($needPost) { Write-Host " + admin/rol" -NoNewline -ForegroundColor Green }
Write-Host ""
