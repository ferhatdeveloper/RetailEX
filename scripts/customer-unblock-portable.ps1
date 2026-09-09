# Müşteri PC: portable zip / exe "engellendi" veya açılmıyorsa.
# Kullanım: .\scripts\customer-unblock-portable.ps1 -Path "C:\RetailEx\App"
# veya tek dosya: -Path "C:\RetailEx\App\retailex.exe"
param(
  [Parameter(Mandatory = $true)]
  [string] $Path
)
$ErrorActionPreference = "Stop"
$p = (Resolve-Path -LiteralPath $Path).Path
if (-not (Test-Path -LiteralPath $p)) { throw "Bulunamadi: $p" }

function Unblock-Tree([string] $root) {
  if (Test-Path -LiteralPath $root -PathType Leaf) {
    Unblock-File -LiteralPath $root -ErrorAction SilentlyContinue
    Write-Host "Unblock: $root"
    return
  }
  Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue
  }
  Write-Host "Unblock tamam: $root"
}

Unblock-Tree $p
Write-Host "Portable: RetailEX_Tools.exe update / migrate; config.db = C:\RetailEx\config.db" -ForegroundColor Cyan
