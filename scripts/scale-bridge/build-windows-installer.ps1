# RetailEX Terazi Köprüsü — Windows kurulum paketi derleme
# Gereksinimler: Rust (cargo), Inno Setup 6 (iscc PATH'te), internet (Node indirme)
#
#   powershell -ExecutionPolicy Bypass -File scripts/scale-bridge/build-windows-installer.ps1
#
# Çıktı: dist/RetailEX-ScaleBridge-Setup.exe
# GitHub Release'e bu exe'yi yükleyin; mağaza PC'de tek tık kurulum.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$DeskApp = Join-Path $Root 'DeskApp'
$ScaleDir = Join-Path $Root 'scripts\scale-bridge'
$Staging = Join-Path $ScaleDir 'installer\staging'
$NodeDir = Join-Path $Staging 'node'
$Dist = Join-Path $Root 'dist'

Write-Host '== RetailEX Scale Bridge installer build =='

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error 'Rust cargo gerekli: https://rustup.rs'
}

Write-Host '1) Rust release derleme...'
Push-Location $DeskApp
cargo build --release --bin RetailEX_Scale_Bridge --bin RetailEX_ScaleBridge_Manager
Pop-Location

Write-Host '2) Staging dizini...'
if (Test-Path $Staging) { Remove-Item -Recurse -Force $Staging }
New-Item -ItemType Directory -Force -Path $Staging, $NodeDir, (Join-Path $Staging 'scale-bridge'), (Join-Path $Staging 'scale-bridge\admin') | Out-Null

Copy-Item -Force (Join-Path $DeskApp 'target\release\RetailEX_Scale_Bridge.exe') $Staging
Copy-Item -Force (Join-Path $DeskApp 'target\release\RetailEX_ScaleBridge_Manager.exe') $Staging
Copy-Item -Force (Join-Path $ScaleDir 'server.mjs') (Join-Path $Staging 'scale-bridge\server.mjs')
Copy-Item -Force (Join-Path $ScaleDir 'rongtaTcp.mjs') (Join-Path $Staging 'scale-bridge\rongtaTcp.mjs')
Copy-Item -Force (Join-Path $ScaleDir 'scan.mjs') (Join-Path $Staging 'scale-bridge\scan.mjs')
Copy-Item -Force (Join-Path $ScaleDir 'admin\index.html') (Join-Path $Staging 'scale-bridge\admin\index.html')
Copy-Item -Force (Join-Path $ScaleDir 'scale-bridge.example.json') $Staging

Write-Host '3) Portable Node.js...'
$NodeZip = Join-Path $env:TEMP 'node-win-x64.zip'
$NodeVer = 'v20.18.1'
if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) {
    $NodeUrl = "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-x64.zip"
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip
    Expand-Archive -Path $NodeZip -DestinationPath $env:TEMP -Force
    Copy-Item -Force (Join-Path $env:TEMP "node-$NodeVer-win-x64\node.exe") (Join-Path $NodeDir 'node.exe')
}

Write-Host '4) Inno Setup...'
$Iscc = Get-Command iscc -ErrorAction SilentlyContinue
if (-not $Iscc) {
    $IsccPath = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $IsccPath) {
        Write-Warning 'Inno Setup (iscc) bulunamadı. Staging hazır; ISS dosyasını Inno Setup IDE ile derleyin:'
        Write-Host "  scripts\scale-bridge\installer\RetailEX.ScaleBridge.iss"
        exit 0
    }
    $Iscc = @{ Source = $IsccPath }
}

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
& $Iscc.Source (Join-Path $ScaleDir 'installer\RetailEX.ScaleBridge.iss')

Write-Host ''
Write-Host "TAMAMLANDI: $Dist\RetailEX-ScaleBridge-Setup.exe"
Write-Host 'Mağaza PC: Setup çalıştır → servis + yönetim UI otomatik açılır.'
Write-Host 'Yönetim: http://127.0.0.1:3012/ui/'
