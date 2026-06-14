# RetailEX Terazi Koprusu — Windows teşhis (ciktiyi kopyalayip destek/ajan ile paylasin)
# Yonetici PowerShell:
#   powershell -ExecutionPolicy Bypass -File "C:\Program Files\RetailEX\ScaleBridge\scale-bridge\diagnose-windows.ps1"

$ErrorActionPreference = 'Continue'
$ServiceName = 'RetailEX_Scale_Bridge'
$ConfigPath = 'C:\ProgramData\RetailEX\scale-bridge.json'
$LogPath = 'C:\ProgramData\RetailEX\scale_bridge_service.log'
$InstallErr = 'C:\ProgramData\RetailEX\RetailEX_Scale_Bridge_install_last_error.txt'
$InstallDir = 'C:\Program Files\RetailEX\ScaleBridge'

Write-Host '========== RetailEX Terazi Koprusu Teşhis ==========' -ForegroundColor Cyan
Write-Host "Tarih: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ''

Write-Host '--- Kurulum dizini ---'
if (Test-Path $InstallDir) {
    Get-ChildItem $InstallDir -Recurse -Depth 2 | Select-Object FullName, Length | Format-Table -AutoSize
} else {
    Write-Host "EKSIK: $InstallDir" -ForegroundColor Red
}

Write-Host '--- Servis durumu ---'
sc.exe query $ServiceName 2>&1
Get-Service $ServiceName -ErrorAction SilentlyContinue | Format-List *

Write-Host '--- node.exe ---'
$nodeBundled = Join-Path $InstallDir 'node\node.exe'
$nodeSystem = 'C:\Program Files\nodejs\node.exe'
Write-Host "Bundled: $nodeBundled -> $(Test-Path $nodeBundled)"
Write-Host "System:  $nodeSystem -> $(Test-Path $nodeSystem)"

Write-Host '--- Config ---'
if (Test-Path $ConfigPath) {
    Get-Content $ConfigPath -Raw
} else {
    Write-Host "EKSIK: $ConfigPath" -ForegroundColor Red
}

Write-Host '--- Port 3012 ---'
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3012/status' -UseBasicParsing -TimeoutSec 5
    Write-Host "status HTTP $($r.StatusCode): $($r.Content)"
} catch {
    Write-Host "status HATA: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host '--- Log (son 30 satir) ---'
if (Test-Path $LogPath) {
    Get-Content $LogPath -Tail 30
} else {
    Write-Host "Log yok: $LogPath"
}

Write-Host '--- Kurulum hata dosyasi ---'
if (Test-Path $InstallErr) {
    Get-Content $InstallErr -Tail 20
} else {
    Write-Host 'Yok (servis kurulumu hata vermemis olabilir)'
}

Write-Host '--- Terazi TCP (config scales) ---'
if (Test-Path $ConfigPath) {
    try {
        $cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($s in ($cfg.scales | Where-Object { $_.ipAddress })) {
            $ip = $s.ipAddress
            $port = if ($s.port) { [int]$s.port } else { 20304 }
            $probePorts = @(20304, 4001, 3001, 3000, 4000, 5000, 8000, 8001, 8080, 9000, 10001)
            Write-Host "Terazi: $ip (config port $port)"
            foreach ($p in ($probePorts | Sort-Object -Unique)) {
                $t = Test-NetConnection -ComputerName $ip -Port $p -WarningAction SilentlyContinue
                $state = if ($t.TcpTestSucceeded) { 'ACIK' } else { 'KAPALI/RED' }
                Write-Host "  TCP $p -> $state"
            }
        }
    } catch {
        Write-Host "Config terazi testi okunamadi: $_"
    }
} else {
    Write-Host 'Config yok — terazi testi atlandi'
}

Write-Host '--- Ag IP ---'
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } | Select-Object IPAddress, InterfaceAlias

Write-Host ''
Write-Host '========== Teşhis bitti ==========' -ForegroundColor Cyan
