# RetailEX Terazi Köprüsü — Windows servisi kurulumu (kaynak ağacından)
# Yönetici PowerShell'de çalıştırın.
# Tek EXE kurulum için: scripts/scale-bridge/build-windows-installer.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DeskApp = Join-Path $Root 'DeskApp'
$ScaleScripts = Join-Path $Root 'scripts\scale-bridge'
$InstallDir = 'C:\Program Files\RetailEX\ScaleBridge'
$ConfigDir = 'C:\ProgramData\RetailEX'

Write-Host '== RetailEX Terazi Köprüsü kurulumu =='

New-Item -ItemType Directory -Force -Path $InstallDir, $ConfigDir | Out-Null

Write-Host 'Derleniyor: RetailEX_Scale_Bridge + Manager (statik CRT)...'
$env:RUSTFLAGS = '-C target-feature=+crt-static'
Push-Location $DeskApp
cargo build --release --bin RetailEX_Scale_Bridge --bin RetailEX_ScaleBridge_Manager
Pop-Location
Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue

$VcDllOk = (Test-Path 'C:\Windows\System32\vcruntime140.dll') -and (Test-Path 'C:\Windows\System32\vcruntime140_1.dll')
if (-not $VcDllOk) {
    Write-Host 'Visual C++ Runtime kuruluyor...'
    $VcTmp = Join-Path $env:TEMP 'vc_redist.x64.exe'
    if (-not (Test-Path $VcTmp)) {
        Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $VcTmp
    }
    Start-Process -FilePath $VcTmp -ArgumentList '/install','/quiet','/norestart' -Wait
}

$ExeSrc = Join-Path $DeskApp 'target\release\RetailEX_Scale_Bridge.exe'
$MgrSrc = Join-Path $DeskApp 'target\release\RetailEX_ScaleBridge_Manager.exe'
Copy-Item -Force $ExeSrc (Join-Path $InstallDir 'RetailEX_Scale_Bridge.exe')
Copy-Item -Force $MgrSrc (Join-Path $InstallDir 'RetailEX_ScaleBridge_Manager.exe')

$BridgeDir = Join-Path $InstallDir 'scale-bridge'
& (Join-Path $ScaleScripts 'copy-bridge-runtime.ps1') -TargetScaleBridgeDir $BridgeDir -SourceScaleDir $ScaleScripts

$TeraziCfg = Join-Path $Root 'TeraziRongta\WindowsFormsApplication1\SYSTEM.CFG'
if (Test-Path $TeraziCfg) {
    $DllOut = Join-Path $ScaleScripts 'rongta-dll-bridge\bin\x86\Release'
    if (Test-Path $DllOut) {
        Copy-Item -Force $TeraziCfg (Join-Path $DllOut 'SYSTEM.CFG') -ErrorAction SilentlyContinue
    }
}

Copy-Item -Force (Join-Path $ScaleScripts 'scale-bridge.example.json') (Join-Path $ConfigDir 'scale-bridge.example.json')

$NodeStaging = Join-Path $ScaleScripts 'installer\staging\node\node.exe'
$NodeDst = Join-Path $InstallDir 'node\node.exe'
if (Test-Path $NodeStaging) {
    New-Item -ItemType Directory -Force -Path (Split-Path $NodeDst) | Out-Null
    Copy-Item -Force $NodeStaging $NodeDst
} elseif (Test-Path 'C:\Program Files\nodejs\node.exe') {
    New-Item -ItemType Directory -Force -Path (Split-Path $NodeDst) | Out-Null
    Copy-Item -Force 'C:\Program Files\nodejs\node.exe' $NodeDst
} elseif (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Warning 'Node.js bulunamadı. build-windows-installer.ps1 ile portable node dahil paket üretin.'
}

node (Join-Path $ScaleScripts 'validate-package.mjs') $BridgeDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ConfigPath = Join-Path $ConfigDir 'scale-bridge.json'
if (-not (Test-Path $ConfigPath)) {
    Copy-Item -Force (Join-Path $ScaleScripts 'scale-bridge.example.json') $ConfigPath
    Write-Host "Örnek config oluşturuldu: $ConfigPath"
}

$Manager = Join-Path $InstallDir 'RetailEX_ScaleBridge_Manager.exe'
& $Manager --install

$FirewallScript = Join-Path $ScaleScripts 'configure-firewall.ps1'
if (Test-Path $FirewallScript) {
    Write-Host 'Guvenlik duvari kurallari uygulaniyor...'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $FirewallScript -Action Install -InstallDir $InstallDir
}

Write-Host ''
Write-Host "Kurulum tamamlandı."
Write-Host "Yönetim UI: http://127.0.0.1:3012/ui/"
Write-Host "Config: $ConfigPath"
Write-Host "TeraziRongta DLL modu: rtslabelscale.dll + SYSTEM.CFG (IP yeterli, TCP port gerekmez)"
