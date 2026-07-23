# RetailEX kurulumu: PostgREST Windows x64 - önce bu script ile aynı kökteki resources/postgrest/postgrest.exe (gömülü), yoksa GitHub indirme.
param(
    [Parameter(Mandatory = $true)]
    [string]$DestinationDir
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$bundled = Join-Path $PSScriptRoot 'postgrest\postgrest.exe'
if (Test-Path -LiteralPath $bundled) {
    if (-not (Test-Path -LiteralPath $DestinationDir)) {
        New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    }
    $dest = Join-Path $DestinationDir 'postgrest.exe'
    Copy-Item -LiteralPath $bundled -Destination $dest -Force
    exit 0
}

$ver = '14.11'
$asset = "postgrest-v$ver-windows-x86-64.zip"
$url = if ($env:POSTGREST_ZIP_URL) { $env:POSTGREST_ZIP_URL } else {
    "https://github.com/PostgREST/postgrest/releases/download/v$ver/$asset"
}
$zip = Join-Path $env:TEMP "retailex_postgrest_$ver.zip"
$unz = Join-Path $env:TEMP "retailex_postgrest_unz_$ver"

if (-not (Test-Path -LiteralPath $DestinationDir)) {
    New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
}

Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
if (Test-Path -LiteralPath $unz) {
    Remove-Item -LiteralPath $unz -Recurse -Force
}
Expand-Archive -Path $zip -DestinationPath $unz -Force
$exe = Get-ChildItem -Path $unz -Filter 'postgrest.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) {
    throw 'postgrest.exe arsivde bulunamadi.'
}
$dest = Join-Path $DestinationDir 'postgrest.exe'
Copy-Item -LiteralPath $exe.FullName -Destination $dest -Force
exit 0
