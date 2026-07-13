# RetailEX Terazi Yonetici — Windows Servisi Kurulumu
# Yonetici PowerShell ile calistirin (kurulum dizininde).

$ErrorActionPreference = 'Stop'
$serviceName = 'RetailEX_Terazi_Sync'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Kurulum (flat): {app}\RetailEX_Terazi_Sync.exe
# Alternatif: {app}\Service\...  |  Gelistirme: TeraziRongta.Service\bin\...
$candidates = @(
    (Join-Path $root 'RetailEX_Terazi_Sync.exe'),
    (Join-Path $root 'Service\RetailEX_Terazi_Sync.exe'),
    (Join-Path $root 'TeraziRongta.Service\bin\x86\Release\RetailEX_Terazi_Sync.exe'),
    (Join-Path $root 'TeraziRongta.Service\bin\x86\Debug\RetailEX_Terazi_Sync.exe')
)
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exe) {
    Write-Error "Servis exe bulunamadi. Adaylar: $($candidates -join ', ')"
}

Write-Host "Servis exe: $exe"

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Mevcut servis durduruluyor..."
    Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName | Out-Null
    Start-Sleep -Seconds 2
}

Write-Host "Servis kuruluyor..."
New-Service -Name $serviceName `
    -BinaryPathName "`"$exe`"" `
    -DisplayName 'RetailEX Terazi Senkron Servisi' `
    -Description 'RetailEX REST API uzerinden urunleri Rongta teraziye otomatik gonderir.' `
    -StartupType Automatic | Out-Null

Start-Service $serviceName
Write-Host "Servis kuruldu ve baslatildi: $serviceName"
Write-Host "Config: C:\ProgramData\RetailEX\terazi-sync.json"
Write-Host "Log: C:\ProgramData\RetailEX\terazi-service.log"
