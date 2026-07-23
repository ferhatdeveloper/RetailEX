#Requires -Version 5.1
<#
  pg_bridge LAN erisimi: Windows guvenlik duvari TCP 3001 (varsayilan AsinERP bridge portu).
  Cihaz A (merkez): npm run bridge / AsinERP bridge 0.0.0.0:3001 dinlemeli.

  Kullanim (yonetici):
    .\bridge-windows-expose-lan.ps1
    .\bridge-windows-expose-lan.ps1 -Port 3001
#>
param(
    [int]$Port = 3001
)

$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host '[Bridge-LAN] Yonetici izni gerekli; UAC acilacak...'
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Port', $Port)
    $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -PassThru -Wait
    exit $(if ($null -ne $proc.ExitCode) { $proc.ExitCode } else { 1 })
}

$ruleName = "AsinERP pg_bridge TCP $Port (LAN)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
    Write-Host "[Bridge-LAN] Firewall: inbound TCP $Port acildi."
}
else {
    Write-Host "[Bridge-LAN] Kural zaten var: $ruleName"
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1).IPAddress
if ($ip) {
    Write-Host "[Bridge-LAN] Tabletler / Android icin URL ornegi: http://${ip}:$Port"
}
else {
    Write-Host "[Bridge-LAN] Bu PC'nin WiFi IP'sini bulun (ipconfig) ve http://<IP>:$Port kullanin."
}

Write-Host '[Bridge-LAN] Bridge baslatma: BRIDGE_BIND=0.0.0.0 BRIDGE_PORT=3001 npm run bridge'
Write-Host '[Bridge-LAN] Test: http://<PC-LAN-IP>:3001/api/status'
exit 0
