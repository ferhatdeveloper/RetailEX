#Requires -Version 5.1
<#
  PostgREST LAN erisimi: Windows guvenlik duvari TCP 3002 (varsayilan RetailEX portu).
  Cihaz A (merkez): postgrest.exe 0.0.0.0:3002 dinlemeli (config/postgrest.conf).

  Kullanim (yonetici):
    .\postgrest-windows-expose-lan.ps1
    .\postgrest-windows-expose-lan.ps1 -Port 3002
#>
param(
    [int]$Port = 3002
)

$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
    Write-Host '[PostgREST-LAN] Yonetici izni gerekli; UAC acilacak...'
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Port', $Port)
    $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -PassThru -Wait
    exit $(if ($null -ne $proc.ExitCode) { $proc.ExitCode } else { 1 })
}

$ruleName = "RetailEX PostgREST TCP $Port (LAN)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
    Write-Host "[PostgREST-LAN] Firewall: inbound TCP $Port acildi."
}
else {
    Write-Host "[PostgREST-LAN] Kural zaten var: $ruleName"
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1).IPAddress
if ($ip) {
    Write-Host "[PostgREST-LAN] Terminaller / Android icin URL ornegi: http://${ip}:$Port"
}
else {
    Write-Host "[PostgREST-LAN] Bu PC'nin WiFi IP'sini bulun (ipconfig) ve http://<IP>:$Port kullanin."
}

Write-Host '[PostgREST-LAN] PostgREST Windows hizmeti: RetailEX_PostgREST (kurulumda otomatik)'
Write-Host '[PostgREST-LAN] Manuel onarim: install-postgrest-service.cmd'
exit 0
