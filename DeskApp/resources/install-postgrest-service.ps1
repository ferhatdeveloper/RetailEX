#Requires -Version 5.1
# RetailEX PostgREST - Windows hizmeti (otomatik baslatma, port 3002)
# Yonetici PowerShell. Onarim: .\install-postgrest-service.ps1 -Repair

param(
    [string]$Prefix = "",
    [switch]$Repair,
    [switch]$Uninstall
)

$ServiceName = "RetailEX_PostgREST"
$DisplayName = "RetailEX PostgREST"
$Description = "PostgreSQL REST API (port 3002) for RetailEX LAN/Android clients."

$LogFile = "$env:TEMP\retailex_postgrest_service_install.log"
function Write-Log($m) { $m | Out-File $LogFile -Append; Write-Host $m }

"=== install-postgrest-service.ps1 $(Get-Date) ===" | Out-File $LogFile -Force

function Get-InstallPrefix {
    param([string]$ParamPrefix)
    $p = $ParamPrefix.Trim()
    if ($p) { return $p }
    $root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $marker = Join-Path $root "retailex_install_prefix.txt"
    if (Test-Path -LiteralPath $marker) {
        $t = (Get-Content -LiteralPath $marker -Raw).Trim()
        if ($t) { return $t }
    }
    $e = [Environment]::GetEnvironmentVariable("RETAILEX_INSTALL_DIR", "Process")
    if ($e) { return $e.Trim() }
    if ($root) { return $root }
    return ""
}

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-PostgrestConfig {
    param([string]$InstallDir)
    $candidates = @(
        (Join-Path $InstallDir '_up_\config\postgrest.conf'),
        (Join-Path $InstallDir 'config\postgrest.conf'),
        (Join-Path (Split-Path $InstallDir -Parent) 'config\postgrest.conf')
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return $c }
    }
    return $null
}

function ConvertFrom-Base64Safe([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
    try {
        $bytes = [Convert]::FromBase64String($Value)
        return [System.Text.Encoding]::UTF8.GetString($bytes)
    }
    catch { return $Value }
}

function Get-PgrestDbUriFromConfigDb {
  $dbPaths = @(
        "C:\RetailEX\config.db",
        "C:\RetailEx\config.db",
        (Join-Path $env:ProgramData "RetailEX\config.db")
    )
    $sqlite = Get-Command sqlite3.exe -ErrorAction SilentlyContinue
    if (-not $sqlite) { return $null }

    foreach ($dbPath in $dbPaths) {
        if (-not (Test-Path -LiteralPath $dbPath)) { continue }
        try {
            $raw = & sqlite3.exe $dbPath "SELECT data FROM config WHERE id = 1;" 2>$null
            if ([string]::IsNullOrWhiteSpace($raw)) { continue }
            $cfg = $raw | ConvertFrom-Json
            $pgHost = if ($cfg.pg_local_host) { [string]$cfg.pg_local_host } else { "127.0.0.1" }
            $port = if ($cfg.pg_local_port) { [string]$cfg.pg_local_port } else { "5432" }
            $user = if ($cfg.pg_local_user) { [string]$cfg.pg_local_user } else { "postgres" }
            $db = if ($cfg.local_db) { [string]$cfg.local_db } else { "retailex_local" }
            $pass = ""
            if ($cfg.PSObject.Properties.Name -contains 'pg_local_pass') {
                $pass = ConvertFrom-Base64Safe ([string]$cfg.pg_local_pass)
            }
            if (-not $pass -and $cfg.PSObject.Properties.Name -contains 'erp_pass') {
                $pass = ConvertFrom-Base64Safe ([string]$cfg.erp_pass)
            }
            if (-not $pass) { return $null }
            $encPass = [uri]::EscapeDataString($pass)
            $encUser = [uri]::EscapeDataString($user)
            return "postgres://${encUser}:${encPass}@${pgHost}:${port}/${db}"
        }
        catch {
            Write-Log "WARN: config.db okunamadi ($dbPath): $_"
        }
    }
    return $null
}

function Set-ServiceEnvironment {
    param(
        [string]$Name,
        [string[]]$Vars
    )
    if (-not $Vars -or $Vars.Count -eq 0) { return }
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$Name"
    if (-not (Test-Path -LiteralPath $regPath)) { return }
    try {
        New-ItemProperty -Path $regPath -Name Environment -Value $Vars -PropertyType MultiString -Force | Out-Null
        Write-Log "Servis ortam degiskenleri yazildi: $($Vars -join '; ')"
    }
    catch {
        Write-Log "WARN: Environment registry yazilamadi: $_"
    }
}

function Remove-PostgrestService {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        if ($svc.Status -eq 'Running') {
            Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        }
        sc.exe delete $ServiceName 2>&1 | Out-File $LogFile -Append
        Start-Sleep -Seconds 2
        Write-Log "Hizmet kaldirildi: $ServiceName"
    }
}

$Prefix = Get-InstallPrefix -ParamPrefix $Prefix
if (-not $Prefix -or -not (Test-Path -LiteralPath $Prefix)) {
    Write-Log "ERROR: Kurulum dizini bulunamadi: '$Prefix'"
    exit 1
}

if (-not (Test-IsAdmin)) {
    Write-Host "[RetailEX] PostgREST hizmeti icin yonetici izni gerekli; UAC acilacak..."
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath)
    if ($Repair) { $argList += "-Repair" }
    if ($Uninstall) { $argList += "-Uninstall" }
    if ($Prefix) { $argList += @("-Prefix", $Prefix) }
    $proc = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList -PassThru -Wait -WorkingDirectory $Prefix
    if (-not $proc) { exit 1 }
    if ($null -eq $proc.ExitCode -or $proc.ExitCode -eq 0) { exit 0 }
    exit $proc.ExitCode
}

if ($Uninstall) {
    Remove-PostgrestService
    exit 0
}

$exePath = Join-Path $Prefix "postgrest.exe"
if (-not (Test-Path -LiteralPath $exePath)) {
    Write-Log "ERROR: postgrest.exe bulunamadi: $exePath"
    exit 1
}

$configPath = Resolve-PostgrestConfig -InstallDir $Prefix
if (-not $configPath) {
    Write-Log "ERROR: postgrest.conf bulunamadi (kurulumda PostgREST secilmeli)."
    exit 1
}

$ImagePath = "`"$exePath`" `"$configPath`""
Write-Log "ImagePath=$ImagePath"

$dbUri = Get-PgrestDbUriFromConfigDb
$envVars = @()
if ($dbUri) {
    $envVars += "PGRST_DB_URI=$dbUri"
    Write-Log "PGRST_DB_URI config.db'den uretildi."
}
else {
    Write-Log "PGRST_DB_URI yok - postgrest.conf icindeki db-uri kullanilacak."
}

$Existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($Existing -and $Repair) {
    Write-Log "Repair: eski hizmet kaldiriliyor..."
    Remove-PostgrestService
    $Existing = $null
}

if ($Existing) {
    Write-Log "Mevcut hizmet guncelleniyor..."
    try {
        if ($Existing.Status -eq 'Running') { Stop-Service -Name $ServiceName -Force -ErrorAction Stop }
    }
    catch { Write-Log "WARN: Stop-Service: $_" }

    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
    Set-ItemProperty -Path $regPath -Name ImagePath -Value $ImagePath -ErrorAction Stop
    Set-Service -Name $ServiceName -DisplayName $DisplayName -StartupType Automatic -ErrorAction SilentlyContinue
    sc.exe description $ServiceName "$Description" 2>&1 | Out-File $LogFile -Append
    Set-ServiceEnvironment -Name $ServiceName -Vars $envVars
}
else {
    Write-Log "Yeni hizmet olusturuluyor..."
    try {
        New-Service -Name $ServiceName -BinaryPathName $ImagePath -DisplayName $DisplayName -StartupType Automatic -ErrorAction Stop
        sc.exe description $ServiceName "$Description" 2>&1 | Out-File $LogFile -Append
        Set-ServiceEnvironment -Name $ServiceName -Vars $envVars
    }
    catch {
        Write-Log "ERROR: New-Service basarisiz (yonetici?): $_"
        exit 1
    }
}

# Hata durumunda otomatik yeniden baslat
sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 2>&1 | Out-File $LogFile -Append

try {
    Start-Service -Name $ServiceName -ErrorAction Stop
    Write-Log "Hizmet baslatildi: $ServiceName (Automatic)"
}
catch {
    Write-Log "WARN: Hizmet baslatilamadi (PostgreSQL hazir degil olabilir): $_"
    Write-Log "PostgreSQL ayaga kalkinca: Start-Service $ServiceName"
    exit 2
}

exit 0
