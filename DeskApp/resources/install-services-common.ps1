#Requires -Version 5.1
# Ortak: RetailEX Windows hizmet kurulumu (GUI EXE exit code guvenilmez — servis kaydini dogrula).

function Test-RetailExAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-RetailExWindowsService {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExePath,
        [Parameter(Mandatory = $true)]
        [string]$ServiceName,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $ExePath)) {
        throw "$Label bulunamadi: $ExePath"
    }

    $logPath = "C:\ProgramData\RetailEX\${ServiceName}_install_last_error.txt"
    Write-Host "[RetailEX] Kuruluyor: $Label ($ServiceName)"

    $null = Start-Process -FilePath $ExePath -ArgumentList @('--install') -Wait -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2

    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        $hint = if (Test-Path -LiteralPath $logPath) { " Log: $logPath" } else { '' }
        throw "$Label kurulamadi ($ServiceName kaydi yok).$hint"
    }

    Write-Host "[RetailEX] $Label hazir: $ServiceName ($($svc.Status))"
    if ($svc.Status -ne 'Running') {
        try {
            Start-Service -Name $ServiceName -ErrorAction Stop
            Write-Host "[RetailEX] Baslatildi: $ServiceName"
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
        return
    }

    Write-Host '[RetailEX] PostgREST Windows hizmeti kuruluyor (otomatik baslatma)...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $postgrestScript -Prefix $Prefix
    $pgrCode = $LASTEXITCODE
    $pgrSvc = Get-Service -Name 'RetailEX_PostgREST' -ErrorAction SilentlyContinue

    if ($pgrSvc) {
        if ($pgrSvc.Status -ne 'Running') {
            Start-Service -Name 'RetailEX_PostgREST' -ErrorAction SilentlyContinue
        }
        Write-Host "[RetailEX] PostgREST hazir: RetailEX_PostgREST ($($pgrSvc.Status))"
        return
    }

    if ($pgrCode -eq 2) {
        Write-Warning 'PostgREST hizmeti kuruldu ancak baslatilamadi (PostgreSQL hazir olmayabilir). Start-Service RetailEX_PostgREST'
        return
    }

    Write-Warning "PostgREST hizmeti kurulamadi (cikis $pgrCode). Manuel: install-postgrest-service.cmd"
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
    $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -PassThru -Wait -WorkingDirectory $Prefix
    if (-not $proc) { return 1 }

    # Elevated PowerShell child processes often return ExitCode=$null on success.
    if ($null -eq $proc.ExitCode -or $proc.ExitCode -eq 0) { return 0 }
    return $proc.ExitCode
}
