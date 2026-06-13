# RetailEX Terazi Köprüsü — Windows kurulum paketi derleme
# Gereksinimler: Rust (cargo), Inno Setup 6 (iscc), internet (Node indirme)
#
# Yerel:
#   powershell -ExecutionPolicy Bypass -File scripts/scale-bridge/build-windows-installer.ps1
#
# CI (GitHub Actions): otomatik — tag scale-bridge-v* veya workflow_dispatch
#
# Çıktı: dist/RetailEX-ScaleBridge-Setup.exe

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$DeskApp = Join-Path $Root 'DeskApp'
$ScaleDir = Join-Path $Root 'scripts\scale-bridge'
$Staging = Join-Path $ScaleDir 'installer\staging'
$NodeDir = Join-Path $Staging 'node'
$Dist = Join-Path $Root 'dist'
$StrictCi = ($env:CI -eq 'true') -or ($env:STRICT_CI -eq '1')

if (-not $env:PACKAGE_VERSION) {
    $env:PACKAGE_VERSION = node -p "require('$Root/package.json').version"
}
$AppVersion = $env:PACKAGE_VERSION
Write-Host "Surum: $AppVersion"

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
Copy-Item -Force (Join-Path $ScaleDir 'diagnose-windows.ps1') (Join-Path $Staging 'scale-bridge\diagnose-windows.ps1')
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
$IsccPath = $null
if (Get-Command iscc -ErrorAction SilentlyContinue) {
    $IsccPath = (Get-Command iscc).Source
} else {
    $IsccPath = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $IsccPath) {
    if ($StrictCi) {
        Write-Error 'Inno Setup (iscc) bulunamadi.'
    }
    Write-Warning 'Inno Setup (iscc) bulunamadi. Staging hazir; ISS dosyasini Inno Setup IDE ile derleyin:'
    Write-Host "  scripts\scale-bridge\installer\RetailEX.ScaleBridge.iss"
    exit 0
}

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
$IssFile = Join-Path $ScaleDir 'installer\RetailEX.ScaleBridge.iss'
& $IsccPath "/DMyAppVersion=$AppVersion" $IssFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$SetupExe = Join-Path $Dist 'RetailEX-ScaleBridge-Setup.exe'
if (-not (Test-Path $SetupExe)) {
    Write-Error "Kurulum dosyasi olusmadi: $SetupExe"
}

Write-Host ''
Write-Host "TAMAMLANDI: $SetupExe"
Write-Host 'Magaza PC: Setup calistir -> servis + yonetim UI acilir.'
Write-Host 'Yonetim: http://127.0.0.1:3012/ui/'
