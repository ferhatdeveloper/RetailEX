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

Write-Host '1) Rust release derleme (statik CRT - VCRUNTIME140.dll gerekmez)...'
$env:RUSTFLAGS = '-C target-feature=+crt-static'
Push-Location $DeskApp
cargo build --release --bin RetailEX_Scale_Bridge --bin RetailEX_ScaleBridge_Manager
Pop-Location
Remove-Item Env:RUSTFLAGS -ErrorAction SilentlyContinue

Write-Host '2) Staging dizini...'
if (Test-Path $Staging) { Remove-Item -Recurse -Force $Staging }
New-Item -ItemType Directory -Force -Path $Staging, $NodeDir | Out-Null

Copy-Item -Force (Join-Path $DeskApp 'target\release\RetailEX_Scale_Bridge.exe') $Staging
Copy-Item -Force (Join-Path $DeskApp 'target\release\RetailEX_ScaleBridge_Manager.exe') $Staging

$CopyScript = Join-Path $ScaleDir 'copy-bridge-runtime.ps1'
& $CopyScript -TargetScaleBridgeDir (Join-Path $Staging 'scale-bridge') -SourceScaleDir $ScaleDir

Copy-Item -Force (Join-Path $ScaleDir 'scale-bridge.example.json') $Staging

Write-Host '2a) TeraziRongta SYSTEM.CFG / DLL (varsa)...'
$TeraziRoot = Join-Path $Root 'TeraziRongta\WindowsFormsApplication1'
$TeraziCfg = Join-Path $TeraziRoot 'SYSTEM.CFG'
$TeraziDll = Join-Path $TeraziRoot 'lib\rtslabelscale.dll'
$DllBridgeDir = Join-Path $ScaleDir 'rongta-dll-bridge'
if (Test-Path $TeraziCfg) {
    Copy-Item -Force $TeraziCfg (Join-Path $DllBridgeDir 'SYSTEM.CFG')
    Write-Host '  SYSTEM.CFG <- TeraziRongta'
}
if (Test-Path $TeraziDll) {
    New-Item -ItemType Directory -Force -Path (Join-Path $TeraziRoot 'lib') | Out-Null
    Write-Host '  rtslabelscale.dll repoda — MSBuild paketleyecek'
}

Write-Host '2b) RongtaDllBridge (TeraziRongta / rtslabelscale.dll)...'
$DllBridgeDir = Join-Path $ScaleDir 'rongta-dll-bridge'
$DllBridgeOut = Join-Path $DllBridgeDir 'bin\x86\Release'
$Msbuild = @(
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($Msbuild -and (Test-Path (Join-Path $DllBridgeDir 'RongtaDllBridge.csproj'))) {
    & $Msbuild (Join-Path $DllBridgeDir 'RongtaDllBridge.csproj') /p:Configuration=Release /p:Platform=x86 /v:minimal
    if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $DllBridgeOut 'RongtaDllBridge.exe'))) {
        $RongtaStaging = Join-Path $Staging 'scale-bridge\rongta-dll-bridge'
        New-Item -ItemType Directory -Force -Path $RongtaStaging | Out-Null
        Copy-Item -Force (Join-Path $DllBridgeOut 'RongtaDllBridge.exe') $RongtaStaging
        Copy-Item -Force (Join-Path $DllBridgeOut 'rtslabelscale.dll') $RongtaStaging
        if (Test-Path (Join-Path $DllBridgeOut 'SYSTEM.CFG')) {
            Copy-Item -Force (Join-Path $DllBridgeOut 'SYSTEM.CFG') $RongtaStaging
        }
        Write-Host '  RongtaDllBridge paketlendi.' -ForegroundColor Green
    } else {
        Write-Warning 'RongtaDllBridge derlenemedi; TCP köprüsü kullanılacak.'
    }
} else {
    Write-Warning 'MSBuild veya RongtaDllBridge.csproj yok; DLL köprüsü atlandı.'
}

Write-Host '3) Portable Node.js...'
$NodeZip = Join-Path $env:TEMP 'node-win-x64.zip'
$NodeVer = 'v20.18.1'
if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) {
    $NodeUrl = "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-x64.zip"
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip
    Expand-Archive -Path $NodeZip -DestinationPath $env:TEMP -Force
    Copy-Item -Force (Join-Path $env:TEMP "node-$NodeVer-win-x64\node.exe") (Join-Path $NodeDir 'node.exe')
}

Write-Host '3b) Visual C++ Redistributable (kuruluma gomulu; yoksa Setup kurar)...'
$VcRedist = Join-Path $Staging 'vc_redist.x64.exe'
if (-not (Test-Path $VcRedist)) {
    Write-Host '  Indiriliyor: vc_redist.x64.exe'
    Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $VcRedist
}
if (-not (Test-Path $VcRedist)) {
    Write-Error 'vc_redist.x64.exe indirilemedi'
}

Write-Host '4) Paket doğrulama...'
node (Join-Path $ScaleDir 'validate-package.mjs') (Join-Path $Staging 'scale-bridge')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '5) Inno Setup...'
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
