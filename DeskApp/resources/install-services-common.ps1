#Requires -Version 5.1
# Ortak: RetailEX Windows hizmet kurulumu (GUI EXE exit code guvenilmez - servis kaydini dogrula).
# ONEMLI: Bu dosyada em-dash (U+2014) KULLANMA. Windows PowerShell 5.1 -File, BOM'suz UTF-8'i
# CP1254 okur; em-dash baytlari (E2 80 94) sahte tirnak uretir ve script parse edilemez (exit 1).

function Test-RetailExAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-RetailExSetupLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LogFile,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )
    # PS 5.1: Out-File -Append varsayilan Unicode(UTF-16); her zaman utf8 kullan.
    $Message | Out-File -FilePath $LogFile -Append -Encoding utf8
}

function Install-RetailExWindowsService {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExePath,
        [Parameter(Mandatory = $true)]
        [string]$ServiceName,
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [int]$MaxAttempts = 3
    )

    if (-not (Test-Path -LiteralPath $ExePath)) {
        throw "$Label bulunamadi: $ExePath"
    }

    $logPath = "C:\ProgramData\RetailEX\${ServiceName}_install_last_error.txt"
    Write-Host "[RetailEX] Kuruluyor: $Label ($ServiceName)"

    $svc = $null
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if ($attempt -gt 1) {
            Write-Host "[RetailEX] Yeniden deneme $attempt/$MaxAttempts : $ServiceName"
            $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
            if ($existing -and $existing.Status -eq 'Running') {
                try {
                    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 2
                }
                catch {}
            }
            # Kilitli/eski kayit: sc delete + kısa bekleme (CreateService ERROR_SERVICE_EXISTS disinda)
            if ($existing -and $attempt -eq $MaxAttempts) {
                sc.exe stop $ServiceName 2>$null | Out-Null
                sc.exe delete $ServiceName 2>$null | Out-Null
                Start-Sleep -Seconds 3
            }
        }

        $null = Start-Process -FilePath $ExePath -ArgumentList @('--install') -Wait -PassThru -WindowStyle Hidden
        Start-Sleep -Seconds 2

        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($svc) { break }
    }

    if (-not $svc) {
        $hint = if (Test-Path -LiteralPath $logPath) { " Log: $logPath" } else { '' }
        throw "$Label kurulamadi ($ServiceName kaydi yok, $MaxAttempts deneme).$hint"
    }

    Write-Host "[RetailEX] $Label hazir: $ServiceName ($($svc.Status))"
    if ($svc.Status -ne 'Running') {
        try {
            Start-Service -Name $ServiceName -ErrorAction Stop
            Start-Sleep -Seconds 2
            $svc.Refresh()
            if ($svc.Status -eq 'Running') {
                Write-Host "[RetailEX] Baslatildi: $ServiceName (Running)"
            }
            else {
                Write-Warning "$ServiceName Start-Service tamamlandi ancak durum: $($svc.Status). Log: C:\ProgramData\RetailEX\ (service.log / sql_bridge_service.log). Manuel: Start-Service $ServiceName"
            }
        }
        catch {
            Write-Warning "$ServiceName kuruldu ancak baslatilamadi: $($_.Exception.Message)"
        }
    }
    return $svc
}

function Install-RetailExPostgrestService {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Prefix
    )

    $postgrestExe = Join-Path $Prefix 'postgrest.exe'
    $postgrestScript = Join-Path $Prefix 'install-postgrest-service.ps1'
    if (-not ((Test-Path -LiteralPath $postgrestExe) -and (Test-Path -LiteralPath $postgrestScript))) {
        Write-Host '[RetailEX] PostgREST atlandi (postgrest.exe veya install-postgrest-service.ps1 yok).'
        return @{ Ok = $true; Skipped = $true; Code = 0 }
    }

    Write-Host '[RetailEX] PostgREST Windows hizmeti kuruluyor (otomatik baslatma)...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $postgrestScript -Prefix $Prefix
    $pgrCode = $LASTEXITCODE
    if ($null -eq $pgrCode) { $pgrCode = 0 }
    $pgrSvc = Get-Service -Name 'RetailEX_PostgREST' -ErrorAction SilentlyContinue

    if ($pgrSvc) {
        if ($pgrSvc.Status -ne 'Running') {
            Start-Service -Name 'RetailEX_PostgREST' -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            $pgrSvc.Refresh()
        }
        Write-Host "[RetailEX] PostgREST hazir: RetailEX_PostgREST ($($pgrSvc.Status))"
        if ($pgrSvc.Status -ne 'Running') {
            Write-Warning 'PostgREST kayitli ama calismiyor. PostgreSQL acik mi? Start-Service RetailEX_PostgREST - log: %TEMP%\retailex_postgrest_service_install.log'
        }
        return @{ Ok = $true; Skipped = $false; Code = 0; Status = $pgrSvc.Status }
    }

    if ($pgrCode -eq 2) {
        Write-Warning 'PostgREST hizmeti kuruldu ancak baslatilamadi (PostgreSQL hazir olmayabilir). Start-Service RetailEX_PostgREST'
        # Kayit olmasa bile exit 2 = baslatma sorunu; yine de çekirdek kurulumu bozma
        return @{ Ok = $true; Skipped = $false; Code = 2 }
    }

    Write-Warning "PostgREST hizmeti kurulamadi (cikis $pgrCode). Manuel: install-postgrest-service.cmd (cekirdek servisler bundan bagimsiz)."
    return @{ Ok = $false; Skipped = $false; Code = $pgrCode }
}

function Invoke-RetailExServiceSetupElevation {
    param(
        [string]$ScriptPath,
        [string]$Prefix
    )

    Write-Host '[RetailEX] Windows hizmetleri icin yonetici izni gerekli; UAC acilacak...'
    $argList = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $ScriptPath,
        '-Prefix', $Prefix
    )
    try {
        $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -PassThru -Wait -WorkingDirectory $Prefix
    }
    catch {
        Write-Warning "UAC/elevation basarisiz: $($_.Exception.Message)"
        return 1
    }
    if (-not $proc) { return 1 }

    # Elevated PowerShell child processes often return ExitCode=$null on success.
    if ($null -eq $proc.ExitCode -or $proc.ExitCode -eq 0) { return 0 }
    return $proc.ExitCode
}
