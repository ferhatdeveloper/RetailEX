# RetailEX PrintServer - Windows Servisi Kurulumu
# Yonetici PowerShell ile calistirin (kurulum dizininde).
# Tek script: -Install | -Uninstall | -Status parametreleri ile islem seciyor.

[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Status
)

$ErrorActionPreference = 'Stop'

# ---- sabitler ----
$serviceName = 'RetailEX_PrintServer'
$displayName = 'RetailEX Yazici Servisi'
$description = 'RetailEX kiracidan gelen yazdirma isteklerini (POS, fatura, mutfak, etiket) Windows yazicilara ve FastReport ile yonlendirir.'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $root '..')

# ---- exe adaylari (sirayla) ----
$candidates = @(
    (Join-Path $root 'RetailEX_PrintServer.exe'),
    (Join-Path $root 'Service\RetailEX_PrintServer.exe'),
    (Join-Path $projectRoot 'PrintServer.Service\bin\Release\net8.0-windows\RetailEX_PrintServer.exe'),
    (Join-Path $projectRoot 'PrintServer.Service\bin\Release\net8.0-windows\win-x64\RetailEX_PrintServer.exe'),
    (Join-Path $projectRoot 'PrintServer.Service\bin\Debug\net8.0-windows\RetailEX_PrintServer.exe')
)
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
    Write-Error "Servis exe bulunamadi. Adaylar:`n$($candidates -join "`n")"
}

Write-Host "Servis exe: $exe"

function Get-ExistingService {
    Get-Service -Name $serviceName -ErrorAction SilentlyContinue
}

function Install-ServiceInternal {
    $existing = Get-ExistingService
    if ($existing) {
        Write-Host 'Mevcut servis durduruluyor ve kaldiriliyor...'
        Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $serviceName | Out-Null
        Start-Sleep -Seconds 2
    }

    Write-Host 'Servis kuruluyor...'
    New-Service -Name $serviceName `
        -BinaryPathName "`"$exe`"" `
        -DisplayName $displayName `
        -Description $description `
        -StartupType Automatic | Out-Null

    Start-Service $serviceName
    Write-Host "Servis kuruldu ve baslatildi: $serviceName"
    Write-Host 'Yapilandirma: C:\ProgramData\RetailEX\print-server.json'
    Write-Host 'Log dosyasi: C:\ProgramData\RetailEX\print-server.log'
}

function Uninstall-ServiceInternal {
    $existing = Get-ExistingService
    if (-not $existing) {
        Write-Host 'Servis zaten kurulu degil.'
        return
    }
    Write-Host 'Servis durduruluyor...'
    Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
    Write-Host 'Servis siliniyor...'
    sc.exe delete $serviceName | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "Servis kaldirildi: $serviceName"
}

function Show-StatusInternal {
    $existing = Get-ExistingService
    if (-not $existing) {
        Write-Host "Servis kurulu degil: $serviceName"
        return
    }
    Get-Service -Name $serviceName | Format-List Name, DisplayName, Status, StartType
    $cfg = Join-Path $env:ProgramData 'RetailEX\print-server.json'
    $log = Join-Path $env:ProgramData 'RetailEX\print-server.log'
    Write-Host "Yapilandirma: $cfg (Exists=$([bool](Test-Path $cfg)))"
    Write-Host "Log dosyasi: $log (Exists=$([bool](Test-Path $log)))"
}

# Parametresiz calistirilirsa davranis: install
if (-not ($Install -or $Uninstall -or $Status)) {
    $Install = $true
}

if ($Install) { Install-ServiceInternal }
if ($Uninstall) { Uninstall-ServiceInternal }
if ($Status) { Show-StatusInternal }