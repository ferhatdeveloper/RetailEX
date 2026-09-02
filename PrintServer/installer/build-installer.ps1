param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$Version = '0.0.0'
)

$ErrorActionPreference = 'Stop'

# 1) Payload hazirla
& (Join-Path $PSScriptRoot 'prepare-payload.ps1') -ProjectRoot $ProjectRoot

# 2) ISCC.exe bul
$isccCandidates = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
)
$iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'ISCC.exe bulunamadi. Inno Setup 6 kurun (ornek: choco install innosetup -y).' }

# 3) Derle
Write-Host "ISCC.exe ile derleniyor (Version=$Version)..."
& $iscc /DMyAppVersion=$Version (Join-Path $PSScriptRoot 'setup.iss')

$out = Join-Path $PSScriptRoot 'output'
$setupExe = Get-ChildItem $out -Filter 'RetailEX.PrintManager-Setup-*.exe' | Select-Object -First 1
if ($setupExe) {
    Write-Host "Setup olusturuldu: $($setupExe.FullName)"
} else {
    Write-Host "Setup olusturuldu: $out"
}