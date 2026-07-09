#Requires -Version 5.1
# NSIS: retailex_install_prefix.txt veya -Prefix ile kurulum dizini alinir.
param(
    [Parameter(Mandatory = $false)]
    [string]$Prefix = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\install-services-common.ps1"

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

$Prefix = Get-InstallPrefix -ParamPrefix $Prefix
if (-not (Test-Path -LiteralPath $Prefix)) {
    Write-Error "Kurulum dizini bulunamadi veya bos: '$Prefix'"
    exit 1
}

if (-not (Test-RetailExAdmin)) {
    $code = Invoke-RetailExServiceSetupElevation -ScriptPath $PSCommandPath -Prefix $Prefix
    exit $code
}

$logFile = "C:\ProgramData\RetailEX\install_services_setup_last.log"
"=== install-services-setup.ps1 $(Get-Date) Prefix=$Prefix ===" | Out-File $logFile -Encoding utf8

$failures = @()

try {
    Install-RetailExWindowsService `
        -ExePath (Join-Path $Prefix "RetailEX_Service.exe") `
        -ServiceName "RetailEX_Service" `
        -Label "RetailEX_Service"
}
catch {
    $msg = $_.Exception.Message
    $failures += $msg
    $msg | Out-File $logFile -Append
    Write-Warning $msg
}

$npmScript = Join-Path $Prefix "install-bridge-npm.ps1"
if (Test-Path -LiteralPath $npmScript) {
    Write-Host "[RetailEX] SQL Bridge npm bagimliliklari..."
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $npmScript -Prefix $Prefix
    }
    catch {
        $msg = "install-bridge-npm: $($_.Exception.Message)"
        $failures += $msg
        $msg | Out-File $logFile -Append
        Write-Warning $msg
    }
}

$bridgeExe = Join-Path $Prefix "RetailEX_SQL_Bridge.exe"
if (Test-Path -LiteralPath $bridgeExe) {
    try {
        Install-RetailExWindowsService `
            -ExePath $bridgeExe `
            -ServiceName "RetailEX_SQL_Bridge" `
            -Label "RetailEX_SQL_Bridge"
    }
    catch {
        $msg = $_.Exception.Message
        $failures += $msg
        $msg | Out-File $logFile -Append
        Write-Warning $msg
    }
}

try {
    Install-RetailExPostgrestService -Prefix $Prefix
}
catch {
    $msg = "PostgREST: $($_.Exception.Message)"
    $failures += $msg
    $msg | Out-File $logFile -Append
    Write-Warning $msg
}

$coreOk = @(
    (Get-Service -Name "RetailEX_Service" -ErrorAction SilentlyContinue),
    (Get-Service -Name "RetailEX_SQL_Bridge" -ErrorAction SilentlyContinue)
) | Where-Object { $_ }

if ($coreOk.Count -lt 2) {
    "BASARISIZ: $($failures -join ' | ')" | Out-File $logFile -Append
    exit 1
}

if ($failures.Count -gt 0) {
    "UYARI (devam): $($failures -join ' | ')" | Out-File $logFile -Append
}

"TAMAM" | Out-File $logFile -Append
exit 0
