# PostgREST Windows x64 zip — DeskApp/resources/postgrest/postgrest.exe olarak çıkarır.
# Kaynak: https://github.com/PostgREST/postgrest/releases
# Çevrimdışı / tekrar indirme istemiyorsanız: POSTGREST_SKIP=1 veya mevcut exe yeterliyse atlanır.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$DeskApp = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path (Join-Path $DeskApp 'resources') 'postgrest'
$TargetExe = Join-Path $OutDir 'postgrest.exe'

if ($env:POSTGREST_SKIP -eq '1') {
    Write-Host '[postgrest] POSTGREST_SKIP=1 — atlanıyor.'
    exit 0
}

if (Test-Path -LiteralPath $TargetExe) {
    $len = (Get-Item $TargetExe).Length
    if ($len -gt 1000000) {
        Write-Host "[postgrest] Zaten mevcut ($([math]::Round($len / 1MB, 2)) MB): $TargetExe"
        exit 0
    }
}

$ver = if ($env:POSTGREST_VERSION) { $env:POSTGREST_VERSION.Trim() } else { '14.11' }
# GitHub sürüm adı: postgrest-v14.11-windows-x86-64.zip (x64 değil)
$asset = "postgrest-v$ver-windows-x86-64.zip"
$ZipUrl = if ($env:POSTGREST_ZIP_URL) { $env:POSTGREST_ZIP_URL } else {
    "https://github.com/PostgREST/postgrest/releases/download/v$ver/$asset"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$zipPath = Join-Path $env:TEMP "retailex-postgrest-$ver-$(Get-Random).zip"

Write-Host "[postgrest] Indiriliyor: $ZipUrl"
Invoke-WebRequest -Uri $ZipUrl -OutFile $zipPath -UseBasicParsing

$extract = Join-Path $env:TEMP "retailex-postgrest-extract-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $extract | Out-Null
try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extract -Force
    $exe = Get-ChildItem -Path $extract -Filter 'postgrest.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $exe) {
        throw 'postgrest.exe arsivde bulunamadi.'
    }
    Copy-Item -LiteralPath $exe.FullName -Destination $TargetExe -Force
    Write-Host "[postgrest] Tamam: $TargetExe (v$ver)"
}
finally {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
}
