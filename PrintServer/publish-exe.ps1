$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dotnet = @(
    (Join-Path $env:LOCALAPPDATA "dotnet\dotnet.exe"),
    (Join-Path $env:ProgramFiles "dotnet\dotnet.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $dotnet) { throw "dotnet bulunamadı." }

$out = Join-Path $root "releases\RetailEX.Printer"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$proj = Join-Path $root "QrPrintDesktop.App\QrPrintDesktop.App.csproj"
& $dotnet publish $proj -c Release -r win-x64 --self-contained true -o $out --nologo -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "EXE: $(Join-Path $out 'RetailEX.QrPrint.exe')"
