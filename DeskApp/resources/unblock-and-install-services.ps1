# Musteri PC: SAC / Mark of the Web engeli sonrasi dosyalari ac + servisleri kur.
# Kullanim (Yonetici PowerShell):
#   cd C:\RetailEx\App
#   powershell -ExecutionPolicy Bypass -File .\unblock-and-install-services.ps1
#Requires -Version 5.1
param(
    [string]$Prefix = ""
)

$ErrorActionPreference = "Continue"
$root = if ($Prefix) { $Prefix } else { $PSScriptRoot }
if (-not (Test-Path -LiteralPath $root)) { throw "Dizin yok: $root" }

Write-Host "[RetailEX] Unblock: $root"
Get-ChildItem -LiteralPath $root -Recurse -Include *.exe,*.ps1,*.cmd,*.dll -File -ErrorAction SilentlyContinue |
    ForEach-Object {
        Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue
    }

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[RetailEX] Yonetici izni isteniyor..."
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", $PSCommandPath, "-Prefix", $root
    ) -Wait
    exit 0
}

Write-Host ""
Write-Host "NOT: Akilli Uygulama Denetimi (SAC) aciksa imzasiz servis EXE engellenir."
Write-Host "  Windows Guvenlik > Uygulama ve tarayici denetimi > Akilli Uygulama Denetimi = Kapali"
Write-Host "  Sonra bu scripti tekrar calistirin."
Write-Host ""

$setup = Join-Path $root "install-services-setup.ps1"
if (-not (Test-Path -LiteralPath $setup)) {
    throw "install-services-setup.ps1 yok: $setup"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup -Prefix $root
exit $LASTEXITCODE
