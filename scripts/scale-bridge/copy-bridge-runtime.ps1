# Terazi köprüsü Node runtime dosyalarını hedef klasöre kopyalar (Tam paket).
param(
    [Parameter(Mandatory = $true)][string]$TargetScaleBridgeDir,
    [Parameter(Mandatory = $true)][string]$SourceScaleDir
)

$ErrorActionPreference = 'Stop'

$adminDir = Join-Path $TargetScaleBridgeDir 'admin'
New-Item -ItemType Directory -Force -Path $TargetScaleBridgeDir, $adminDir | Out-Null

$rootFiles = @(
    'server.mjs',
    'rongtaTcp.mjs',
    'scan.mjs',
    'scalePorts.mjs',
    'listen.mjs',
    'rongtaDll.mjs',
    'diagnose-windows.ps1',
    'configure-firewall.ps1',
    'diagnose-scale.mjs'
)

foreach ($f in $rootFiles) {
    $src = Join-Path $SourceScaleDir $f
    if (-not (Test-Path $src)) {
        Write-Error "Eksik köprü dosyasi: $src"
    }
    Copy-Item -Force $src (Join-Path $TargetScaleBridgeDir $f)
}

Copy-Item -Force (Join-Path $SourceScaleDir 'admin\index.html') (Join-Path $adminDir 'index.html')

$sdkSrc = Join-Path $SourceScaleDir 'sdk'
$sdkDst = Join-Path $TargetScaleBridgeDir 'sdk'
if (Test-Path $sdkDst) { Remove-Item -Recurse -Force $sdkDst }
Copy-Item -Recurse -Force $sdkSrc $sdkDst

Write-Host "Kopyalandi: $TargetScaleBridgeDir (sdk dahil)"
