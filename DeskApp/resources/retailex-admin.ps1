$ErrorActionPreference = "Stop"

param(
    [string]$ConfigDbPath = "C:\RetailEx\config.db",
    [switch]$Menu
)

$Script:ServiceNames = @("RetailEX_Service", "RetailEX_VPN", "RetailEX_SQL_Bridge")
$Script:PassFields = @("erp_pass", "pg_remote_pass", "pg_local_pass", "logo_objects_pass")
$Script:LogPath = Join-Path $env:TEMP "retailex_admin.log"

function Write-Info([string]$Message) {
    $line = "[INFO]  $Message"
    Write-Host $line
    Add-Content -Path $Script:LogPath -Value $line
}

function Write-WarnMsg([string]$Message) {
    $line = "[WARN]  $Message"
    Write-Warning $Message
    Add-Content -Path $Script:LogPath -Value $line
}

function Write-ErrMsg([string]$Message) {
    $line = "[ERROR] $Message"
    Write-Error $Message
    Add-Content -Path $Script:LogPath -Value $line
}

function Start-AdminSession {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Info "Yonetici yetkisi gerekiyor, UAC talep ediliyor..."
        $elevateArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ConfigDbPath `"$ConfigDbPath`" -Menu"
        Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $elevateArgs | Out-Null
        exit 0
    }
}

function ConvertFrom-Base64([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
    try {
        $bytes = [Convert]::FromBase64String($Value)
        return [System.Text.Encoding]::UTF8.GetString($bytes)
    } catch {
        return $Value
    }
}

function ConvertTo-Base64([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    return [Convert]::ToBase64String($bytes)
}

function Get-ConfigJsonRaw {
    $sqlite = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
    if (-not $sqlite) { throw "sqlite3.exe bulunamadi. Lutfen sqlite3 kurun veya PATH'e ekleyin." }
    $q = "SELECT data FROM config WHERE id = 1;"
    $out = & sqlite3.exe $ConfigDbPath $q
    if ([string]::IsNullOrWhiteSpace($out)) { throw "config tablosunda id=1 kaydi yok." }
    return $out
}

function Save-ConfigJsonRaw([string]$JsonText) {
    $sqlite = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
    if (-not $sqlite) { throw "sqlite3.exe bulunamadi. Lutfen sqlite3 kurun veya PATH'e ekleyin." }
    $escaped = $JsonText.Replace("'", "''")
    $sql = "INSERT INTO config (id,data) VALUES (1,'$escaped') ON CONFLICT(id) DO UPDATE SET data=excluded.data;"
    & sqlite3.exe $ConfigDbPath $sql | Out-Null
}

function Get-AppConfig {
    $raw = Get-ConfigJsonRaw
    $cfg = $raw | ConvertFrom-Json
    foreach ($f in $Script:PassFields) {
        if ($cfg.PSObject.Properties.Name -contains $f) {
            $cfg.$f = ConvertFrom-Base64 $cfg.$f
        }
    }
    if ($cfg.vpn_config -and $cfg.vpn_config.private_key) {
        $cfg.vpn_config.private_key = ConvertFrom-Base64 $cfg.vpn_config.private_key
    }
    return $cfg
}

function Save-AppConfig($cfg) {
    foreach ($f in $Script:PassFields) {
        if ($cfg.PSObject.Properties.Name -contains $f) {
            $cfg.$f = ConvertTo-Base64 ([string]$cfg.$f)
        }
    }
    if ($cfg.vpn_config -and $cfg.vpn_config.private_key) {
        $cfg.vpn_config.private_key = ConvertTo-Base64 ([string]$cfg.vpn_config.private_key)
    }
    $json = $cfg | ConvertTo-Json -Depth 20 -Compress
    Save-ConfigJsonRaw -JsonText $json
}

function Show-CurrentConfig {
    $cfg = Get-AppConfig
    Write-Host ""
    Write-Host "=== Mevcut Konfigurasyon ==="
    Write-Host "db_mode       : $($cfg.db_mode)"
    Write-Host "role          : $($cfg.role)"
    Write-Host "local_db      : $($cfg.local_db)"
    Write-Host "remote_db     : $($cfg.remote_db)"
    Write-Host "logo_active   : $($cfg.logo_objects_active)"
    Write-Host "logo_user     : $($cfg.logo_objects_user)"
    Write-Host "logo_path     : $($cfg.logo_objects_path)"
    Write-Host "backup_enabled: $($cfg.backup_config.enabled)"
    Write-Host "backup_daily  : $($cfg.backup_config.daily_backup)"
    Write-Host "backup_hourly : $($cfg.backup_config.hourly_backup)"
    Write-Host "backup_period : $($cfg.backup_config.periodic_min)"
}

function Set-RoleAndMode {
    $cfg = Get-AppConfig
    $role = Read-Host "Rol secin (terminal/server)"
    $mode = Read-Host "db_mode secin (online/offline/hybrid)"
    if ($role -notin @("terminal","server")) { throw "Gecersiz rol." }
    if ($mode -notin @("online","offline","hybrid")) { throw "Gecersiz db_mode." }
    $cfg.role = $role
    $cfg.db_mode = $mode
    Save-AppConfig $cfg
    Write-Info "Rol ve db_mode guncellendi."
}

function Set-LogoConfig {
    $cfg = Get-AppConfig
    $active = Read-Host "Logo Objects aktif mi? (true/false)"
    $user = Read-Host "Logo Objects kullanici adi"
    $pass = Read-Host "Logo Objects sifre"
    $path = Read-Host "LObjects.dll tam yol"

    $cfg.logo_objects_active = [System.Convert]::ToBoolean($active)
    $cfg.logo_objects_user = $user
    $cfg.logo_objects_pass = $pass
    $cfg.logo_objects_path = $path
    Save-AppConfig $cfg
    Write-Info "Logo Objects ayarlari kaydedildi."
}

function Install-CoreServices {
    $baseDir = Split-Path -Parent $PSCommandPath
    $svcExe = Join-Path $baseDir "RetailEX_Service.exe"
    $vpnExe = Join-Path $baseDir "RetailEX_VPN.exe"
    $bridgeExe = Join-Path $baseDir "RetailEX_SQL_Bridge.exe"
    $bridgePs = Join-Path $baseDir "install-bridge.ps1"

    if (-not (Test-Path $svcExe)) { throw "RetailEX_Service.exe bulunamadi: $svcExe" }
    if (-not (Test-Path $vpnExe)) { throw "RetailEX_VPN.exe bulunamadi: $vpnExe" }

    Write-Info "RetailEX_Service kuruluyor..."
    & $svcExe --install
    Start-Sleep -Seconds 1
    Start-Service -Name "RetailEX_Service" -ErrorAction SilentlyContinue

    Write-Info "RetailEX_VPN kuruluyor..."
    & $vpnExe --install
    Start-Sleep -Seconds 1
    Start-Service -Name "RetailEX_VPN" -ErrorAction SilentlyContinue

    if (Test-Path $bridgeExe) {
        Write-Info "RetailEX_SQL_Bridge kuruluyor..."
        & $bridgeExe --install
        Start-Sleep -Seconds 1
        Start-Service -Name "RetailEX_SQL_Bridge" -ErrorAction SilentlyContinue
    } elseif (Test-Path $bridgePs) {
        Write-Info "RetailEX_SQL_Bridge legacy script ile kuruluyor..."
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bridgePs
    } else {
        Write-WarnMsg "RetailEX_SQL_Bridge.exe/install-bridge.ps1 bulunamadi, SQL Bridge atlandi."
    }

    Write-Info "Servis kurulum denemesi tamamlandi."
}

function Show-ServiceHealth {
    Write-Host ""
    Write-Host "=== Servis Sagligi ==="
    foreach ($n in $Script:ServiceNames) {
        $svc = Get-Service -Name $n -ErrorAction SilentlyContinue
        if ($svc) {
            Write-Host ("{0,-22} : {1}" -f $n, $svc.Status)
        } else {
            Write-Host ("{0,-22} : NOT_INSTALLED" -f $n)
        }
    }
}

function Show-RecentServiceLogs {
    Write-Host ""
    Write-Host "=== Son Servis Olaylari (1000/7000/7009) ==="
    foreach ($n in $Script:ServiceNames) {
        Write-Host "-- $n --"
        Get-WinEvent -FilterHashtable @{ LogName='System'; Id=7000,7009,7031,7034; StartTime=(Get-Date).AddDays(-3) } -ErrorAction SilentlyContinue |
            Where-Object { $_.Message -like "*$n*" } |
            Select-Object -First 5 TimeCreated, Id, LevelDisplayName, Message |
            Format-List
    }
}

function Set-BackupSchedule {
    $taskName = "RetailEX_Periodic_Backup"
    $minutes = Read-Host "Kac dakikada bir yedek (orn: 30)"
    if (-not [int]::TryParse($minutes, [ref]([int]$null))) { throw "Dakika sayisi gecersiz." }

    $baseDir = Split-Path -Parent $PSCommandPath
    $backupRunner = Join-Path $baseDir "RetailEX_Service.exe"
    if (-not (Test-Path $backupRunner)) { throw "RetailEX_Service.exe bulunamadi." }

    $action = New-ScheduledTaskAction -Execute $backupRunner -Argument "--backup-once"
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes ([int]$minutes)) `
        -RepetitionDuration ([TimeSpan]::MaxValue)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
    Write-Info "Yedek gorevi olusturuldu: $taskName / $minutes dk"
}

function Show-ImprovementHints {
    $cfg = Get-AppConfig
    Write-Host ""
    Write-Host "=== Iyilestirme Onerileri ==="
    if ($cfg.db_mode -eq "online") {
        Write-Host "- Online mod: internet kesintilerine karsi hybrid onerilir."
    }
    if ([string]::IsNullOrWhiteSpace($cfg.logo_objects_path)) {
        Write-Host "- Logo Objects yolu bos, entegrasyon hatasi alabilirsiniz."
    }
    foreach ($n in $Script:ServiceNames) {
        $svc = Get-Service -Name $n -ErrorAction SilentlyContinue
        if (-not $svc) {
            Write-Host "- $n kurulu degil. Servis kurulumu menusu ile kurun."
        } elseif ($svc.Status -ne "Running") {
            Write-Host "- $n calismiyor. Baslatma ve hata loglarini kontrol edin."
        }
    }
}

function Show-MenuAndRun {
    while ($true) {
        Write-Host ""
        Write-Host "==== RetailEX Admin ===="
        Write-Host "1) Config goster (config.db)"
        Write-Host "2) Rol + db_mode degistir"
        Write-Host "3) Logo Objects ayarlari"
        Write-Host "4) Servisleri kur/baslat"
        Write-Host "5) Servis sagligi"
        Write-Host "6) Son servis loglari"
        Write-Host "7) Periyodik yedek gorevi olustur"
        Write-Host "8) Iyilestirme onerileri"
        Write-Host "9) Cikis"
        $c = Read-Host "Secim"
        switch ($c) {
            "1" { Show-CurrentConfig }
            "2" { Set-RoleAndMode }
            "3" { Set-LogoConfig }
            "4" { Install-CoreServices }
            "5" { Show-ServiceHealth }
            "6" { Show-RecentServiceLogs }
            "7" { Set-BackupSchedule }
            "8" { Show-ImprovementHints }
            "9" { break }
            default { Write-WarnMsg "Gecersiz secim." }
        }
    }
}

try {
    Start-AdminSession
    Write-Info "RetailEX admin araci basladi. Log: $Script:LogPath"
    if ($Menu) {
        Show-MenuAndRun
    } else {
        Show-MenuAndRun
    }
}
catch {
    Write-ErrMsg $_.Exception.Message
    exit 1
}
