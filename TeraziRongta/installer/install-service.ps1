# Yonetici PowerShell ile calistirin (kurulum dizininde).
$ErrorActionPreference = 'Stop'
$serviceName = 'RetailEX_Terazi_Sync'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root 'RetailEX_Terazi_Sync.exe'

if (-not (Test-Path $exe)) {
  Write-Error "Servis bulunamadi: $exe"
}

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
  sc.exe delete $serviceName | Out-Null
  Start-Sleep -Seconds 2
}

New-Service -Name $serviceName `
  -BinaryPathName "`"$exe`"" `
  -DisplayName 'RetailEX Terazi Senkron Servisi' `
  -Description 'RetailEX REST API uzerinden urunleri Rongta teraziye otomatik gonderir.' `
  -StartupType Automatic | Out-Null

Start-Service $serviceName
Write-Host "Servis kuruldu ve baslatildi: $serviceName"
Write-Host "Config: C:\ProgramData\RetailEX\terazi-sync.json"
