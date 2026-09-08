# RetailEX Printer Servisi kurulumu — Yönetici PowerShell ile çalıştırın.
param(
    [string]$ExePath = ""
)

$ErrorActionPreference = "Stop"
$serviceName = "RetailEX_Printer"
$legacyName = "RetailEX_QrPrint"
$displayName = "RetailEX Printer Servisi"
$installDir = "C:\ProgramData\RetailEX\QrPrint\Service"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-CompleteServiceExe([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path $path)) { return $false }
    $dll = [System.IO.Path]::ChangeExtension($path, ".dll")
    return (Test-Path $dll)
}

function Get-DotnetExe {
    @(
        (Join-Path $env:LOCALAPPDATA "dotnet\dotnet.exe"),
        (Join-Path $env:ProgramFiles "dotnet\dotnet.exe")
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Get-DotnetRootWithNet9 {
    foreach ($candidate in @(
        (Join-Path $env:LOCALAPPDATA "dotnet"),
        (Join-Path $env:ProgramFiles "dotnet")
    )) {
        $shared = Join-Path $candidate "shared\Microsoft.NETCore.App"
        $has9 = Get-ChildItem $shared -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name.StartsWith("9.") }
        if ($has9) {
            return $candidate
        }
    }
    return $null
}

function Find-ServiceProject([string]$start) {
    $dir = $start
    for ($i = 0; $i -lt 8; $i++) {
        $proj = Join-Path $dir "QrPrintDesktop.Service\QrPrintDesktop.Service.csproj"
        if (Test-Path $proj) { return $proj }
        $parent = Split-Path $dir -Parent
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $dir) { break }
        $dir = $parent
    }
    return $null
}

function Find-BuiltServiceExe([string]$start) {
    $candidates = @()
    if ($ExePath) { $candidates += $ExePath }
    $candidates += @(
        (Join-Path $start "Service\RetailEX_Printer_Service.exe"),
        (Join-Path $start "RetailEX_Printer_Service.exe")
    )
    $dir = $start
    for ($i = 0; $i -lt 6; $i++) {
        $candidates += Join-Path $dir "QrPrintDesktop.Service\bin\Release\net9.0-windows\RetailEX_Printer_Service.exe"
        $candidates += Join-Path $dir "QrPrintDesktop.App\bin\Release\net9.0-windows\Service\RetailEX_Printer_Service.exe"
        $parent = Split-Path $dir -Parent
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $dir) { break }
        $dir = $parent
    }
    return $candidates | Where-Object { Test-CompleteServiceExe $_ } | Select-Object -First 1
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$exe = $null
$dotnetExe = Get-DotnetExe
$proj = Find-ServiceProject $root

if ($dotnetExe -and $proj) {
    Write-Host "Özerk (self-contained) servis yayınlanıyor..."
    Write-Host "dotnet: $dotnetExe"
    Write-Host "proje: $proj"
    & $dotnetExe publish $proj -c Release -r win-x64 --self-contained true -o $installDir --nologo
    $published = Join-Path $installDir "RetailEX_Printer_Service.exe"
    if ($LASTEXITCODE -eq 0 -and (Test-Path $published)) {
        $exe = $published
        Write-Host "Yayın başarılı: $exe"
    }
    else {
        Write-Host "Yayın başarısız, mevcut derleme kopyalanacak."
    }
}

if (-not $exe) {
    $built = Find-BuiltServiceExe $root
    if (-not $built) {
        Write-Error "Servis exe+dll bulunamadı."
    }
    $builtDir = Split-Path $built -Parent
    Write-Host "Derleme kopyalanıyor: $builtDir -> $installDir"
    Copy-Item -Path (Join-Path $builtDir "*") -Destination $installDir -Recurse -Force
    $exe = Join-Path $installDir "RetailEX_Printer_Service.exe"
    if (-not (Test-CompleteServiceExe $exe)) {
        Write-Error "Kopyalanan servis paketi eksik: $exe"
    }
}

$exe = (Resolve-Path $exe).Path
Write-Host "Servis exe: $exe"

foreach ($name in @($legacyName, $serviceName)) {
    $existing = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Mevcut servis durduruluyor: $name"
        Stop-Service $name -Force -ErrorAction SilentlyContinue
        sc.exe delete $name | Out-Null
        Start-Sleep -Seconds 2
    }
}

Write-Host "Servis kuruluyor..."
New-Service -Name $serviceName `
    -BinaryPathName "`"$exe`"" `
    -DisplayName $displayName `
    -Description "RetailEX mutfak ve QR siparişlerini alır, 80mm fiş yazdırır." `
    -StartupType Automatic | Out-Null

$dotnetRoot = Get-DotnetRootWithNet9
if ($dotnetRoot) {
    Write-Host "DOTNET_ROOT: $dotnetRoot"
    New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName" `
        -Name Environment -PropertyType MultiString `
        -Value @("DOTNET_ROOT=$dotnetRoot", "DOTNET_MULTILEVEL_LOOKUP=0") -Force | Out-Null
}

sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
sc.exe config $serviceName start= delayed-auto | Out-Null

Start-Service $serviceName
Start-Sleep -Seconds 2
$svc = Get-Service $serviceName
Write-Host "Servis durumu: $($svc.Status)  ($displayName)"
Write-Host "Config: C:\ProgramData\RetailEX\QrPrint\settings.json"
Write-Host "Log: C:\ProgramData\RetailEX\QrPrint\qrprint-service.log"

if ($svc.Status -ne "Running") {
    Write-Host ""
    Write-Host "Servis başlamadı. Event Viewer > Windows Günlükleri > Uygulama kaydına bakın."
    Read-Host "Kapatmak için Enter"
    exit 1
}
