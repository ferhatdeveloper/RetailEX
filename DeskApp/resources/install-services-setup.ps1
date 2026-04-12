#Requires -Version 5.1
# NSIS: retailex_install_prefix.txt veya -Prefix veya RETAILEX_INSTALL_DIR ile kurulum dizini alinir (bosluklu yol guvenli).
param(
    [Parameter(Mandatory = $false)]
    [string]$Prefix = ""
)

$ErrorActionPreference = "Stop"

function Get-InstallPrefix {
    param([string]$ParamPrefix)
    $p = $ParamPrefix.Trim()
    if ($p) { return $p }
    $root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $marker = Join-Path $root "retailex_install_prefix.txt"
    if (Test-Path -LiteralPath $marker) {
        $t = (Get-Content -LiteralPath $marker -Raw).Trim()
        if ($t) { return $t }
    }
    $e = [Environment]::GetEnvironmentVariable("RETAILEX_INSTALL_DIR", "Process")
    if ($e) { return $e.Trim() }
    return ""
}

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$Prefix = Get-InstallPrefix -ParamPrefix $Prefix

if (-not (Test-Path -LiteralPath $Prefix)) {
    Write-Error "Kurulum dizini bulunamadi veya bos: '$Prefix'"
    exit 1
}

if (-not (Test-IsAdmin)) {
    Write-Host "[RetailEX] Windows hizmetleri icin yonetici izni gerekli; UAC penceresi acilacak..."
    $argList = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $PSCommandPath
    )
    $proc = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList -PassThru -Wait -WorkingDirectory $Prefix
    if (-not $proc) { exit 1 }
    $code = $proc.ExitCode
    if ($null -eq $code) { exit 1 }
    exit $code
}

function Invoke-ServiceInstall {
    param([string]$ExePath, [string]$Label)
    if (-not (Test-Path -LiteralPath $ExePath)) {
        Write-Error "$Label bulunamadi: $ExePath"
        exit 1
    }
    Write-Host "[RetailEX] Kuruluyor: $Label"
    $p = Start-Process -FilePath $ExePath -ArgumentList @("--install") -Wait -PassThru -NoNewWindow
    $code = if ($null -ne $p -and $null -ne $p.ExitCode) { $p.ExitCode } else { -1 }
    if ($code -ne 0) {
        Write-Error "$Label --install basarisiz (cikis $code)"
        exit $code
    }
}

function Start-RetailExService {
    param([string]$Name)
    $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($null -eq $svc) { return }
    if ($svc.Status -ne "Running") {
        Write-Host "[RetailEX] Baslatiliyor: $Name"
        Start-Service -Name $Name -ErrorAction SilentlyContinue
    }
}

$serviceExe = Join-Path $Prefix "RetailEX_Service.exe"
$vpnExe = Join-Path $Prefix "RetailEX_VPN.exe"
$bridgeExe = Join-Path $Prefix "RetailEX_SQL_Bridge.exe"
$npmScript = Join-Path $Prefix "install-bridge-npm.ps1"

Invoke-ServiceInstall -ExePath $serviceExe -Label "RetailEX_Service"
Invoke-ServiceInstall -ExePath $vpnExe -Label "RetailEX_VPN"
Start-RetailExService -Name "RetailEX_Service"
Start-RetailExService -Name "RetailEX_VPN"

if (Test-Path -LiteralPath $npmScript) {
    Write-Host "[RetailEX] SQL Bridge npm bagimliliklari..."
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $npmScript -Prefix $Prefix
    }
    catch {
        Write-Warning "install-bridge-npm: $($_.Exception.Message)"
    }
}

if (Test-Path -LiteralPath $bridgeExe) {
    Invoke-ServiceInstall -ExePath $bridgeExe -Label "RetailEX_SQL_Bridge"
    Start-RetailExService -Name "RetailEX_SQL_Bridge"
}

exit 0
