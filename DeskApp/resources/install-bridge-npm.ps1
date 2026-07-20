#Requires -Version 5.1
# Kurulum dizininde bridge.cjs ve kitchen-print-service.mjs icin npm install (NSIS / elle). -Prefix ile klasor verilebilir.
# Cikis kodlari: 0=ok/atlandi, 1=npm install hatasi, 2=Node/npm bulunamadi
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

function Resolve-NpmCmd {
    $candidates = New-Object System.Collections.Generic.List[string]

    foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($root) {
            $candidates.Add((Join-Path $root "nodejs\npm.cmd"))
        }
    }
    if ($env:LOCALAPPDATA) {
        $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\node\npm.cmd"))
    }
    # nvm-windows: %NVM_HOME%\<version>\npm.cmd - once nvm current symlink yoksa PATH'e guven
    if ($env:NVM_SYMLINK) {
        $candidates.Add((Join-Path $env:NVM_SYMLINK "npm.cmd"))
    }

    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath $c)) { return $c }
    }

    $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) {
        return $cmd.Source
    }
    $cmd = Get-Command npm -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) {
        return $cmd.Source
    }

    # where.exe (yukselen PATH / makine PATH)
    try {
        $whereOut = & where.exe npm.cmd 2>$null
        if ($LASTEXITCODE -eq 0 -and $whereOut) {
            $first = ($whereOut | Select-Object -First 1).ToString().Trim()
            if ($first -and (Test-Path -LiteralPath $first)) { return $first }
        }
    } catch {}

    return $null
}

$npm = Resolve-NpmCmd
if (-not $npm) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Yellow
    Write-Host "[install-bridge-npm] Node.js / npm bulunamadi." -ForegroundColor Yellow
    Write-Host "SQL Bridge (port 3001) ve Printer servisi icin Node.js LTS gerekir." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1) https://nodejs.org  adresinden LTS kurun (onerilen)."
    Write-Host "  2) Kurulumdan sonra bu scripti yeniden calistirin:"
    Write-Host "     $PSCommandPath"
    Write-Host "  3) Veya: Start-Service RetailEX_SQL_Bridge; Start-Service RetailEX_Printer (node + node_modules hazirsa)"
    Write-Host ""
    Write-Host "Not: PostgREST (port 3002) Node gerektirmez; ayri kurulur."
    Write-Host "     Yalnizca bulut/online REST kullanacaksaniz yerel Bridge atlanabilir."
    Write-Host "============================================================" -ForegroundColor Yellow
    Write-Host ""
    exit 2
}

Write-Host "[install-bridge-npm] npm: $npm"
& $npm install --omit=dev --no-audit --no-fund
exit $LASTEXITCODE
