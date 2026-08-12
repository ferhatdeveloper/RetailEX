#Requires -Version 5.1
<#
  Cihaz A (merkez): PostgREST'i LAN'a acik baslatir.
  - postgrest.conf: server-host=0.0.0.0, server-port=3002
  - PGRST_DB_URI ortam degiskeni ile sifre verin

  Ornek:
    $env:PGRST_DB_URI = 'postgres://postgres:SIFRE@127.0.0.1:5432/retailex_local'
    .\start-postgrest-lan.ps1 -InstallDir 'C:\Program Files\RetailEX'
#>
param(
    [string]$InstallDir = '',
    [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'

if (-not $InstallDir) {
    if ($PSScriptRoot) { $InstallDir = $PSScriptRoot }
    else { $InstallDir = (Get-Location).Path }
}

$exe = Join-Path $InstallDir 'postgrest.exe'
if (-not (Test-Path -LiteralPath $exe)) {
    $exe = Get-Command postgrest.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
}
if (-not $exe -or -not (Test-Path -LiteralPath $exe)) {
    Write-Error "postgrest.exe bulunamadi. Kurulumda PostgREST secin veya postgrest.exe'yi $InstallDir altina koyun."
}

if (-not $ConfigPath) {
    $candidates = @(
        (Join-Path $InstallDir '_up_\config\postgrest.conf'),
        (Join-Path $InstallDir 'config\postgrest.conf'),
        (Join-Path (Split-Path $InstallDir -Parent) 'config\postgrest.conf')
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { $ConfigPath = $c; break }
    }
}
if (-not $ConfigPath -or -not (Test-Path -LiteralPath $ConfigPath)) {
    Write-Error "postgrest.conf bulunamadi. -ConfigPath verin veya _up_\config\postgrest.conf kopyalayin."
}

if (-not $env:PGRST_DB_URI) {
    Write-Warning 'PGRST_DB_URI bos - config/postgrest.conf icindeki db-uri kullanilacak.'
    Write-Host 'Onerilen: $env:PGRST_DB_URI = "postgres://postgres:SIFRE@127.0.0.1:5432/retailex_local"'
}

Write-Host "[PostgREST] Baslatiliyor: $exe $ConfigPath"
Write-Host '[PostgREST] Durdurmak icin Ctrl+C'

& $exe $ConfigPath
