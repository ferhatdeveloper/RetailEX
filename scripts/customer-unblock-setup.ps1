# Müşteri / kurulum PC: setup çift tıklayınca hiç açılmıyorsa veya "engellendi" diyorsa deneyin.
# Kullanım (PowerShell): .\scripts\customer-unblock-setup.ps1 -SetupPath "E:\PRG\EXFIN\retailex_0.1.66_x64-setup.exe"
param(
  [Parameter(Mandatory = $true)]
  [string] $SetupPath
)
$ErrorActionPreference = "Stop"
$p = (Resolve-Path -LiteralPath $SetupPath).Path
if (-not (Test-Path -LiteralPath $p)) { throw "Dosya bulunamadi: $p" }
Unblock-File -LiteralPath $p -ErrorAction SilentlyContinue
Write-Host "Imza:" -ForegroundColor Cyan
Get-AuthenticodeSignature -LiteralPath $p | Format-List Status, StatusMessage, SignerCertificate
Write-Host "Kurulum baslatiliyor (per-machine icin UAC istenebilir)..." -ForegroundColor Cyan
Start-Process -FilePath $p -Verb RunAs
