$ErrorActionPreference = "Stop"

$logFile = Join-Path $env:TEMP "retailex_manual_service_install.log"
Start-Transcript -Path $logFile -Append | Out-Null

function Write-Info($msg) {
    Write-Host "[INFO] $msg"
}

function Write-WarnMsg($msg) {
    Write-Warning $msg
}

function Start-AdminSession {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Info "Restarting with administrator privileges..."
        $elevateArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        Start-Process powershell -Verb RunAs -ArgumentList $elevateArgs
        Stop-Transcript | Out-Null
        exit 0
    }
}

function Test-RequiredFile($path, $label) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "$label not found: $path"
    }
}

function Install-AppService($exePath, $serviceName) {
    Test-RequiredFile $exePath $serviceName

    Write-Info "Installing $serviceName from $exePath"
    # GUI-subsystem EXE'lerde & ile calistirmada $LASTEXITCODE guvenilir degil; Start-Process kullan.
    $p = Start-Process -FilePath $exePath -ArgumentList @("--install") -Wait -PassThru -NoNewWindow
    $code = if ($null -ne $p -and $null -ne $p.ExitCode) { [int]$p.ExitCode } else { -1 }
    if ($code -ne 0) {
        throw "$serviceName --install failed with exit code $code (yonetici haklari gerekir veya ProgramData loguna bakin: C:\ProgramData\RetailEX\${serviceName}_install_last_error.txt)."
    }

    Start-Sleep -Seconds 1
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        throw "$serviceName could not be created."
    }

    if ($svc.Status -ne "Running") {
        Write-Info "Starting $serviceName"
        Start-Service -Name $serviceName
    }
}

try {
    Start-AdminSession

    $baseDir = Split-Path -Parent $PSCommandPath
    $serviceExe = Join-Path $baseDir "RetailEX_Service.exe"
    $bridgeExe = Join-Path $baseDir "RetailEX_SQL_Bridge.exe"
    $bridgeScript = Join-Path $baseDir "install-bridge.ps1"

    Install-AppService -exePath $serviceExe -serviceName "RetailEX_Service"

    if (Test-Path $bridgeExe) {
        Install-AppService -exePath $bridgeExe -serviceName "RetailEX_SQL_Bridge"
    }
    elseif (Test-Path $bridgeScript) {
        Write-Info "Installing SQL Bridge service with legacy script..."
        & powershell -NoProfile -ExecutionPolicy Bypass -File $bridgeScript
    }     else {
        Write-WarnMsg "RetailEX_SQL_Bridge.exe/install-bridge.ps1 not found, SQL Bridge skipped."
    }

    $postgrestExe = Join-Path $baseDir "postgrest.exe"
    $postgrestScript = Join-Path $baseDir "install-postgrest-service.ps1"
    if ((Test-Path $postgrestExe) -and (Test-Path $postgrestScript)) {
        Write-Info "Installing PostgREST Windows service (automatic startup)..."
        & powershell -NoProfile -ExecutionPolicy Bypass -File $postgrestScript -Prefix $baseDir
        $pgrCode = $LASTEXITCODE
        if ($pgrCode -eq 2) {
            Write-WarnMsg "PostgREST service installed but not started (PostgreSQL may not be ready). Run: Start-Service RetailEX_PostgREST"
        }
        elseif ($pgrCode -ne 0) {
            Write-WarnMsg "install-postgrest-service.ps1 exit $pgrCode"
        }
        else {
            $pgrSvc = Get-Service -Name "RetailEX_PostgREST" -ErrorAction SilentlyContinue
            if ($pgrSvc -and $pgrSvc.Status -ne "Running") {
                Start-Service -Name "RetailEX_PostgREST" -ErrorAction SilentlyContinue
            }
        }
    }
    else {
        Write-WarnMsg "postgrest.exe/install-postgrest-service.ps1 not found, PostgREST service skipped."
    }

    # PostgreSQL: tum agdan erisim (listen_addresses + pg_hba + firewall 5432)
    $exposeCandidates = @(
        (Join-Path $baseDir "pg-windows-expose-remote.ps1")
        (Join-Path $baseDir "..\..\database\scripts\pg-windows-expose-remote.ps1")
        (Join-Path (Split-Path $baseDir -Parent) "database\scripts\pg-windows-expose-remote.ps1")
    )
    $exposePs1 = $exposeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($exposePs1) {
        Write-Info "Configuring PostgreSQL for remote access: $exposePs1"
        try {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $exposePs1 -AllowAllNetworks
        }
        catch {
            Write-WarnMsg "PostgreSQL expose script failed (run elevated?): $($_.Exception.Message)"
        }
    }
    else {
        Write-WarnMsg "pg-windows-expose-remote.ps1 not found; PostgreSQL may only listen on localhost."
    }

    Write-Info "Manual service installation completed."
    Write-Info "Log file: $logFile"
}
catch {
    Write-Error "Manual service installation failed: $($_.Exception.Message)"
    Write-Host "Log file: $logFile"
    exit 1
}
finally {
    try { Stop-Transcript | Out-Null } catch {}
}
