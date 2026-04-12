#Requires -Version 5.1
# Kurulum dizininde bridge.cjs icin npm install (NSIS / elle). -Prefix ile klasor verilebilir.
param(
    [string]$Prefix = ""
)
$ErrorActionPreference = "Stop"
if ($Prefix) {
    Set-Location -LiteralPath $Prefix
} elseif ($MyInvocation.MyCommand.Path) {
    Set-Location -LiteralPath (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
if (-not (Test-Path -LiteralPath "package.json")) {
    Write-Host "[install-bridge-npm] package.json yok, atlaniyor."
    exit 0
}
$npm = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
if (-not (Test-Path -LiteralPath $npm)) {
    $pf86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    if ($pf86) {
        $npm = Join-Path $pf86 "nodejs\npm.cmd"
    }
}
if (-not (Test-Path -LiteralPath $npm)) {
    Write-Error "[install-bridge-npm] npm.cmd bulunamadi (Node.js LTS kurun)."
    exit 1
}
& $npm install --omit=dev --no-audit --no-fund
exit $LASTEXITCODE
