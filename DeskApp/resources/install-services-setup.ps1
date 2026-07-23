#Requires -Version 5.1
# NSIS: retailex_install_prefix.txt veya -Prefix ile kurulum dizini alinir.
# ONEMLI: em-dash (U+2014) kullanma - PS 5.1 BOM'suz UTF-8'i CP1254 okur, parse bozulur.
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

$logDir = "C:\ProgramData\RetailEX"
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir "install_services_setup_last.log"
"=== install-services-setup.ps1 $(Get-Date) Prefix=$Prefix ===" | Out-File $logFile -Encoding utf8

$failures = @()
$warnings = @()

try {
    Install-RetailExWindowsService `
        -ExePath (Join-Path $Prefix "RetailEX_Service.exe") `
        -ServiceName "RetailEX_Service" `
        -Label "RetailEX_Service"
}
catch {
    $msg = $_.Exception.Message
    $failures += $msg
    Write-RetailExSetupLog -LogFile $logFile -Message $msg
    Write-Warning $msg
}

$npmScript = Join-Path $Prefix "install-bridge-npm.ps1"
if (Test-Path -LiteralPath $npmScript) {
    Write-Host "[RetailEX] SQL Bridge / Printer npm bagimliliklari..."
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $npmScript -Prefix $Prefix
        $npmCode = $LASTEXITCODE
        if ($null -eq $npmCode) { $npmCode = 0 }
        if ($npmCode -eq 2) {
            $msg = "Node.js/npm yok - SQL Bridge (3001) ve Printer servisi calismaz. https://nodejs.org LTS kurun, sonra: $npmScript -Prefix `"$Prefix`". PostgREST (3002) bundan bagimsizdir."
            $warnings += $msg
            Write-RetailExSetupLog -LogFile $logFile -Message "UYARI: $msg"
            Write-Warning $msg
        }
        elseif ($npmCode -ne 0) {
            $msg = "install-bridge-npm cikis kodu $npmCode (node_modules eksik kalabilir)."
            $warnings += $msg
            Write-RetailExSetupLog -LogFile $logFile -Message "UYARI: $msg"
            Write-Warning $msg
        }
    }
    catch {
        $msg = "install-bridge-npm: $($_.Exception.Message)"
        $warnings += $msg
        Write-RetailExSetupLog -LogFile $logFile -Message "UYARI: $msg"
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
        Write-RetailExSetupLog -LogFile $logFile -Message $msg
        Write-Warning $msg
    }
}
else {
    $msg = "RetailEX_SQL_Bridge.exe yok - SQL Bridge hizmeti atlandi."
    $warnings += $msg
    Write-RetailExSetupLog -LogFile $logFile -Message "UYARI: $msg"
    Write-Warning $msg
}

$printerExe = Join-Path $Prefix "RetailEX_Printer.exe"
if (Test-Path -LiteralPath $printerExe) {
    try {
        Install-RetailExWindowsService `
            -ExePath $printerExe `
            -ServiceName "RetailEX_Printer" `
            -Label "RetailEX_Printer"
    }
    catch {
        $msg = $_.Exception.Message
        $failures += $msg
        Write-RetailExSetupLog -LogFile $logFile -Message $msg
        Write-Warning $msg
    }
}
else {
    $msg = "RetailEX_Printer.exe yok - Printer hizmeti atlandi."
    $warnings += $msg
    Write-RetailExSetupLog -LogFile $logFile -Message "UYARI: $msg"
    Write-Warning $msg
}

try {
    $pgr = Install-RetailExPostgrestService -Prefix $Prefix
    if ($pgr -and -not $pgr.Ok -and -not $pgr.Skipped) {
        $msg = "PostgREST kurulamadi (cikis $($pgr.Code)) - cekirdek servislerden bagimsiz; manuel: install-postgrest-service.cmd"
        $warnings += $msg
        Write-RetailExSetupLog -LogFile $logFile -Message "UYARI: $msg"
    }
}
catch {
    $msg = "PostgREST: $($_.Exception.Message)"
    $warnings += $msg
    Write-RetailExSetupLog -LogFile $logFile -Message "UYARI: $msg"
    Write-Warning $msg
}

$svcCore = Get-Service -Name "RetailEX_Service" -ErrorAction SilentlyContinue
$svcBridge = Get-Service -Name "RetailEX_SQL_Bridge" -ErrorAction SilentlyContinue
$svcPrinter = Get-Service -Name "RetailEX_Printer" -ErrorAction SilentlyContinue
$bridgeExpected = Test-Path -LiteralPath $bridgeExe
$printerExpected = Test-Path -LiteralPath $printerExe

$coreOk = $false
if ($bridgeExpected) {
    $coreOk = [bool]$svcCore -and [bool]$svcBridge
}
else {
    # Bridge paketlenmemisse yalnizca Sync Service yeterli
    $coreOk = [bool]$svcCore
}
if ($coreOk -and $printerExpected) {
    $coreOk = [bool]$svcPrinter
}

if (-not $coreOk) {
    $summary = "BASARISIZ: cekirdek hizmet kaydi eksik. failures=$($failures -join ' | '); warnings=$($warnings -join ' | ')"
    Write-RetailExSetupLog -LogFile $logFile -Message $summary
    Write-RetailExSetupLog -LogFile $logFile -Message "Manuel: $Prefix\install-services-manual.cmd (Yonetici olarak calistirin)"
    # Kismi: Sync var, Bridge yok -> exit 2 (NSIS uyari, kurulumu tamamen iptal etme)
    if ($svcCore -and $bridgeExpected -and -not $svcBridge) {
        exit 2
    }
    exit 1
}

if ($warnings.Count -gt 0) {
    Write-RetailExSetupLog -LogFile $logFile -Message "UYARI (devam): $($warnings -join ' | ')"
}
if ($failures.Count -gt 0) {
    Write-RetailExSetupLog -LogFile $logFile -Message "NOT: bazi hatalar sonra toparlandi: $($failures -join ' | ')"
}

Write-RetailExSetupLog -LogFile $logFile -Message "TAMAM"
exit 0
