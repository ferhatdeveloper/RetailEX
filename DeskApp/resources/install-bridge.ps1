$ServiceName = "RetailEX_SQL_Bridge"
$DisplayName = "RetailEX SQL Bridge"
$Description = "PostgreSQL connectivity bridge for RetailEX Browser mode."

$LogFile = "$env:TEMP\retailex_bridge_install.log"
"Starting install-bridge.ps1 at $(Get-Date)" | Out-File $LogFile

# Check if service exists
$Service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($Service) {
    "Service $ServiceName already exists." | Out-File $LogFile -Append
    if ($Service.Status -ne 'Running') {
        Write-Host "Starting service..."
        Start-Service -Name $ServiceName
    }
    exit 0
}

Write-Host "Installing $DisplayName..."

# Find node.exe
$NodePath = "C:\Program Files\nodejs\node.exe"
if (!(Test-Path $NodePath)) {
    $NodePath = where.exe node.exe | Select-Object -First 1
}

if (!$NodePath) {
    "node.exe not found! Please install Node.js." | Out-File $LogFile -Append
    exit 1
}
"Using Node: $NodePath" | Out-File $LogFile -Append

# Find bridge.cjs (relative to the script location or passed as arg)
$ScriptPath = $MyInvocation.MyCommand.Path
$BaseDir = Split-Path $ScriptPath
$BridgePath = Join-Path $BaseDir "bridge.cjs"
"Using Bridge: $BridgePath" | Out-File $LogFile -Append

if (!(Test-Path $BridgePath)) {
    "bridge.cjs not found at $BridgePath" | Out-File $LogFile -Append
    exit 1
}

$Command = "`"$NodePath`" `"$BridgePath`""
try {
    "Attempting to create service..." | Out-File $LogFile -Append
    # Redirect errors to log
    sc.exe create $ServiceName binPath= "cmd /c start /b $Command" start= auto DisplayName= "$DisplayName" 2>&1 | Out-File $LogFile -Append
    sc.exe description $ServiceName "$Description" 2>&1 | Out-File $LogFile -Append
    sc.exe start $ServiceName 2>&1 | Out-File $LogFile -Append
    "Service setup complete." | Out-File $LogFile -Append
} catch {
    "CRITICAL ERROR: $($_.Exception.Message)" | Out-File $LogFile -Append
}
