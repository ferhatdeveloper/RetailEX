# RetailEX Terazi Köprüsü — Windows servisi kurulumu
# Yönetici PowerShell'de çalıştırın.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DeskApp = Join-Path $Root 'DeskApp'
$ScaleScripts = Join-Path $Root 'scripts\scale-bridge'
$InstallDir = 'C:\Program Files\RetailEX'
$ConfigDir = 'C:\ProgramData\RetailEX'

Write-Host '== RetailEX Terazi Köprüsü kurulumu =='

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js gerekli: https://nodejs.org'
}

New-Item -ItemType Directory -Force -Path $InstallDir, $ConfigDir | Out-Null

Write-Host 'Derleniyor: RetailEX_Scale_Bridge...'
Push-Location $DeskApp
cargo build --release --bin RetailEX_Scale_Bridge
Pop-Location

$ExeSrc = Join-Path $DeskApp 'target\release\RetailEX_Scale_Bridge.exe'
$ExeDst = Join-Path $InstallDir 'RetailEX_Scale_Bridge.exe'
Copy-Item -Force $ExeSrc $ExeDst

$BridgeDir = Join-Path $InstallDir 'scale-bridge'
New-Item -ItemType Directory -Force -Path $BridgeDir | Out-Null
Copy-Item -Force (Join-Path $ScaleScripts 'server.mjs') (Join-Path $BridgeDir 'server.mjs')
Copy-Item -Force (Join-Path $ScaleScripts 'rongtaTcp.mjs') (Join-Path $BridgeDir 'rongtaTcp.mjs')
Copy-Item -Force (Join-Path $ScaleScripts 'scale-bridge.example.json') (Join-Path $ConfigDir 'scale-bridge.example.json')

$ConfigPath = Join-Path $ConfigDir 'scale-bridge.json'
if (-not (Test-Path $ConfigPath)) {
    Copy-Item -Force (Join-Path $ScaleScripts 'scale-bridge.example.json') $ConfigPath
    Write-Host "Örnek config oluşturuldu: $ConfigPath"
}

& $ExeDst --install
Write-Host 'Servis kuruldu. Başlatmak için: net start RetailEX_Scale_Bridge'
Write-Host "Config düzenleyin: $ConfigPath"
Write-Host 'Test: curl http://127.0.0.1:3012/status'
