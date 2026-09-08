$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dotnet = @(
    (Join-Path $env:LOCALAPPDATA "dotnet\dotnet.exe"),
    (Join-Path $env:ProgramFiles "dotnet\dotnet.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $dotnet) { throw "dotnet bulunamadı." }

$out = Join-Path $root "releases\RetailEX.Printer"
$svcOut = Join-Path $out "Service"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $svcOut | Out-Null

$appProj = Join-Path $root "QrPrintDesktop.App\QrPrintDesktop.App.csproj"
$svcProj = Join-Path $root "QrPrintDesktop.Service\QrPrintDesktop.Service.csproj"

& $dotnet publish $appProj -c Release -r win-x64 --self-contained true -o $out --nologo -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $dotnet publish $svcProj -c Release -r win-x64 --self-contained true -o $svcOut --nologo -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Copy-Item (Join-Path $root "install-service.ps1") $out -Force
Copy-Item (Join-Path $root "uninstall-service.ps1") $out -Force

$appExe = Join-Path $out "RetailEX.QrPrint.exe"
$svcExe = Join-Path $svcOut "RetailEX_Printer_Service.exe"
if (-not (Test-Path $appExe)) { throw "Uygulama exe yok: $appExe" }
if (-not (Test-Path $svcExe)) { throw "Servis exe yok: $svcExe" }
Write-Host "APP: $appExe"
Write-Host "SVC: $svcExe"
