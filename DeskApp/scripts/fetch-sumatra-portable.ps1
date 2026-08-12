# SumatraPDF portable zip'i indirip DeskApp/resources/sumatra/SumatraPDF.exe olarak çıkarır.
# GPLv3 — https://www.sumatrapdfreader.org/
# Çevrimdışı derleme: SUMATRA_SKIP=1 veya mevcut exe ile atlanır.

$ErrorActionPreference = 'Stop'
$DeskApp = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path (Join-Path $DeskApp 'resources') 'sumatra'
$TargetExe = Join-Path $OutDir 'SumatraPDF.exe'

if ($env:SUMATRA_SKIP -eq '1') {
    Write-Host '[sumatra] SUMATRA_SKIP=1 — atlanıyor.'
    exit 0
}

if (Test-Path -LiteralPath $TargetExe) {
    $len = (Get-Item $TargetExe).Length
    if ($len -gt 500000) {
        Write-Host "[sumatra] Zaten mevcut ($([math]::Round($len/1MB, 2)) MB): $TargetExe"
        exit 0
    }
}

$ZipUrl = if ($env:SUMATRA_ZIP_URL) { $env:SUMATRA_ZIP_URL } else {
    'https://files2.sumatrapdfreader.org/software/sumatrapdf/rel/3.5.2/SumatraPDF-3.5.2-64.zip'
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$zipPath = Join-Path $env:TEMP "sumatra-portable-$(Get-Random).zip"

Write-Host "[sumatra] Indiriliyor: $ZipUrl"
Invoke-WebRequest -Uri $ZipUrl -OutFile $zipPath -UseBasicParsing

$extract = Join-Path $env:TEMP "sumatra-extract-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $extract | Out-Null
try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extract -Force
    # Resmi zip tek dosya: SumatraPDF-3.5.2-64.exe (veya SumatraPDF.exe)
    $exe = Get-ChildItem -Path $extract -Filter 'SumatraPDF*.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $exe) {
        throw 'Zip icinde SumatraPDF*.exe bulunamadi.'
    }
    Copy-Item -LiteralPath $exe.FullName -Destination $TargetExe -Force
    Write-Host "[sumatra] Tamam: $TargetExe"
}
finally {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
}
