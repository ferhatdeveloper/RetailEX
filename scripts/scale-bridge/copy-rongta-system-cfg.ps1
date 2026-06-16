# Çalışan Rongta SYSTEM.CFG dosyasını RetailEX terazi köprüsüne kopyalar.
# PowerShell 5.1 uyumlu.
#
# Varsayılan kaynak (sizin PC):
#   C:\Users\FERHAT\Desktop\TeraziRongta\WindowsFormsApplication1\bin\x86\Debug\SYSTEM.CFG
#
# Kullanım:
#   powershell -ExecutionPolicy Bypass -File scripts\scale-bridge\copy-rongta-system-cfg.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\scale-bridge\copy-rongta-system-cfg.ps1 -Commit

param(
    [string]$Source = "C:\Users\FERHAT\Desktop\TeraziRongta\WindowsFormsApplication1\bin\x86\Debug\SYSTEM.CFG",
    [switch]$Commit
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Targets = @(
    (Join-Path $Root "scripts\scale-bridge\rongta-dll-bridge\SYSTEM.CFG"),
    (Join-Path $Root "TeraziRongta\WindowsFormsApplication1\SYSTEM.CFG")
)

if (-not (Test-Path $Source)) {
    Write-Error "Kaynak SYSTEM.CFG bulunamadi: $Source"
}

foreach ($dest in $Targets) {
    $dir = Split-Path -Parent $dest
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    Copy-Item -Force $Source $dest
    Write-Host "Kopyalandi -> $dest" -ForegroundColor Green
}

Write-Host ""
Write-Host "Sonraki adim (DLL koprüsü):" -ForegroundColor Cyan
Write-Host "  cd scripts\scale-bridge\rongta-dll-bridge"
Write-Host "  msbuild RongtaDllBridge.csproj /p:Configuration=Release /p:Platform=x86"
Write-Host ""

if ($Commit) {
    Set-Location $Root
    git add scripts/scale-bridge/rongta-dll-bridge/SYSTEM.CFG TeraziRongta/WindowsFormsApplication1/SYSTEM.CFG
    git commit -m "chore: calisan Rongta SYSTEM.CFG (masaustu Debug)"
    git push origin main
    Write-Host "Git push tamam." -ForegroundColor Green
}
