# RetailEX PrintServer kurulum paketi hazirligi
# Release build ciktisini installer/payload altina kopyalar; Inno Setup icin duz pakettir.

param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$payload = Join-Path $PSScriptRoot 'payload'

$svcPublish = Join-Path $ProjectRoot "PrintServer.Service\bin\$Configuration\net8.0-windows"
$svcPublishWin = Join-Path $ProjectRoot "PrintServer.Service\bin\$Configuration\net8.0-windows\win-x64"
$svcBin = Join-Path $ProjectRoot "PrintServer.Service\bin\$Configuration\net8.0-windows"

$sourceDirs = @($svcPublish, $svcPublishWin, $svcBin) | Where-Object { Test-Path $_ }
if ($sourceDirs.Count -eq 0) {
    throw "Release build missing: once 'dotnet publish -c Release' ile PrintServer.Service derleyin."
}

# Payload klasoru sifirlama (mevcut icerigi temizle, .gitkeep haric).
# 'designer' alt klasoru workflow'un Designer publish adimi tarafindan
# ayri olarak hazirlanir; burada silmeyiz (shim + designer exeleri kaybolur).
if (-not (Test-Path $payload)) { New-Item -ItemType Directory -Force -Path $payload | Out-Null }
Get-ChildItem -Path $payload -Force | Where-Object { $_.Name -ne '.gitkeep' -and $_.Name -ne 'designer' } | Remove-Item -Recurse -Force

$sourceDir = $sourceDirs[0]
Write-Host "Payload kaynagi: $sourceDir"

# Tum dosyalari kopyala (alt klasorler dahil)
Get-ChildItem -Path $sourceDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($sourceDir.Length).TrimStart('\', '/')
    $dest = Join-Path $payload $rel
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
    Copy-Item $_.FullName $dest -Force
}

# Ornek yapilandirma ve install script
Copy-Item (Join-Path $ProjectRoot 'print-server.example.json') (Join-Path $payload 'print-server.example.json') -Force
Copy-Item (Join-Path $PSScriptRoot 'install-service.ps1') (Join-Path $payload 'install-service.ps1') -Force

# .gitkeep garanti
if (-not (Test-Path (Join-Path $payload '.gitkeep'))) {
    New-Item -ItemType File -Force -Path (Join-Path $payload '.gitkeep') | Out-Null
}

Write-Host "Payload guncellendi: $payload"
Get-ChildItem $payload | Select-Object Name, Length | Format-Table | Out-String | Write-Host