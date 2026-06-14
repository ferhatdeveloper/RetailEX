# RetailEX Terazi Köprüsü — Windows servisi kurulumu
# Yönetici PowerShell'de çalıştırın.
# Tek EXE kurulum için: scripts/scale-bridge/build-windows-installer.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DeskApp = Join-Path $Root 'DeskApp'
$ScaleScripts = Join-Path $Root 'scripts\scale-bridge'
$InstallDir = 'C:\Program Files\RetailEX\ScaleBridge'
$ConfigDir = 'C:\ProgramData\RetailEX'

Write-Host '== RetailEX Terazi Köprüsü kurulumu =='

New-Item -ItemType Directory -Force -Path $InstallDir, $ConfigDir, (Join-Path $InstallDir 'scale-bridge\admin') | Out-Null

Write-Host 'Derleniyor: RetailEX_Scale_Bridge + Manager (statik CRT)...'
$env:RUSTFLAGS = '-C target-feature=+crt-static'
Push-Location $DeskApp
cargo build --release --bin RetailEX_Scale_Bridge --bin RetailEX_ScaleBridge_Manager
Pop-Location
Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue

# VC++ Runtime (VCRUNTIME140.dll) yoksa kur
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
foreach ($f in @('server.mjs','rongtaTcp.mjs','scan.mjs')) {
    Copy-Item -Force (Join-Path $ScaleScripts $f) (Join-Path $BridgeDir $f)
}
# Rust servis çözümleyicisi kökte scale_bridge_server.mjs de arar
Copy-Item -Force (Join-Path $ScaleScripts 'server.mjs') (Join-Path $InstallDir 'scale_bridge_server.mjs')
Copy-Item -Force (Join-Path $ScaleScripts 'admin\index.html') (Join-Path $BridgeDir 'admin\index.html')
Copy-Item -Force (Join-Path $ScaleScripts 'scale-bridge.example.json') (Join-Path $ConfigDir 'scale-bridge.example.json')

# Portable Node (varsa staging'den, yoksa sistem node)
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
