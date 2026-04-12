#Requires -Version 5.1
# RetailEX SQL Bridge — once npm install (hono/pg), sonra Windows hizmeti
# Yonetici PowerShell. Eski bozuk kurulum: .\install-bridge.ps1 -Repair

param(
    [switch]$Repair
)

$ServiceName = "RetailEX_SQL_Bridge"
$DisplayName = "RetailEX SQL Bridge"
$Description = "PostgreSQL connectivity bridge for RetailEX Browser mode."

$LogFile = "$env:TEMP\retailex_bridge_install.log"
function Write-Log($m) { $m | Out-File $LogFile -Append; Write-Host $m }

"=== install-bridge.ps1 $(Get-Date) ===" | Out-File $LogFile -Force

$ScriptPath = $MyInvocation.MyCommand.Path
$BaseDir = Split-Path -LiteralPath $ScriptPath
$BridgePath = Join-Path $BaseDir "bridge.cjs"
$PkgJson = Join-Path $BaseDir "package.json"

$NodePath = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path -LiteralPath $NodePath)) {
    $w = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($w) { $NodePath = $w.Source }
}
if (-not (Test-Path -LiteralPath $NodePath)) {
    Write-Log "ERROR: node.exe not found. Install Node.js LTS."
    exit 1
}
Write-Log "Using Node: $NodePath"

$NpmPath = Join-Path (Split-Path $NodePath) "npm.cmd"
if (-not (Test-Path -LiteralPath $NpmPath)) {
    Write-Log "ERROR: npm.cmd not found next to node."
    exit 1
}

if (-not (Test-Path -LiteralPath $BridgePath)) {
    Write-Log "ERROR: bridge.cjs not found: $BridgePath"
    exit 1
}

if (-not (Test-Path -LiteralPath $PkgJson)) {
    Write-Log "ERROR: package.json missing (hono/pg). Path: $PkgJson"
    exit 1
}

Write-Log "npm install (bridge dependencies)..."
Push-Location $BaseDir
try {
    & $NpmPath install --omit=dev --no-audit --no-fund 2>&1 | Out-File $LogFile -Append
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: npm install failed (exit $LASTEXITCODE)."
        exit 1
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath (Join-Path $BaseDir "node_modules\pg"))) {
    Write-Log "ERROR: node_modules\pg missing after npm install."
    exit 1
}

# Hizmet gorunumu: "node.exe" "bridge.cjs" — modul cozumu bridge.cjs yanindaki node_modules
$ImagePath = "`"$NodePath`" `"$BridgePath`""

$Existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($Existing -and $Repair) {
    Write-Log "Repair: removing old service..."
    if ($Existing.Status -eq 'Running') { Stop-Service -Name $ServiceName -Force }
    sc.exe delete $ServiceName 2>&1 | Out-File $LogFile -Append
    Start-Sleep -Seconds 2
    $Existing = $null
}

if ($Existing) {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
    $img = $null
    try {
        $img = (Get-ItemProperty -LiteralPath $regPath -ErrorAction Stop).ImagePath
    }
    catch { }
    # NSIS kurulum: hizmet RetailEX_SQL_Bridge.exe — ImagePath'i node'a cevirme
    if ($img -and $img -match 'RetailEX_SQL_Bridge\.exe') {
        Write-Log "Hizmet exe saricisi kullaniyor; yalnizca npm deps guncelleniyor: $BaseDir"
        Push-Location $BaseDir
        try {
            & $NpmPath install --omit=dev --no-audit --no-fund 2>&1 | Out-File $LogFile -Append
        }
        finally {
            Pop-Location
        }
        Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
        Write-Log "Tamam (exe korundu). Log: $LogFile"
        exit 0
    }

    Write-Log "Updating service ImagePath (legacy node dogrudan)..."
    try {
        Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    }
    catch {
        Write-Log "WARN: Stop-Service: $_"
    }
    Set-ItemProperty -Path $regPath -Name ImagePath -Value $ImagePath -ErrorAction Stop
    Set-Service -Name $ServiceName -DisplayName $DisplayName -StartupType Automatic -ErrorAction SilentlyContinue
    try {
        $reg = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName" -ErrorAction SilentlyContinue
        if ($reg.PSObject.Properties.Name -contains 'Description') {
            Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName" -Name Description -Value $Description -ErrorAction SilentlyContinue
        }
    }
    catch { }
    Start-Service -Name $ServiceName
    Write-Log "Done (updated). Log: $LogFile"
    exit 0
}

Write-Log "Creating service ImagePath=$ImagePath"
try {
    New-Service -Name $ServiceName -BinaryPathName $ImagePath -DisplayName $DisplayName -StartupType Automatic -ErrorAction Stop
    sc.exe description $ServiceName "$Description" 2>&1 | Out-File $LogFile -Append
}
catch {
    Write-Log "ERROR: New-Service failed (run as Administrator): $_"
    exit 1
}
Start-Service -Name $ServiceName
Write-Log "Service started. Log: $LogFile"
exit 0
