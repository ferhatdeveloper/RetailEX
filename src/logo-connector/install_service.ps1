# RetailEX-Logo-Connector Windows Service Installation Script
# Run as Administrator

$ServiceName = "RetailEXLogoConnector"
$BinaryPath = "$PSScriptRoot\target\release\retailex-logo-connector.exe"
$DisplayName = "RetailEX Logo Connector Service"
$Description = "Background service for synchronizing Logo ERP data with RetailEX Central DB."

# Check if binary exists
if (-not (Test-Path $BinaryPath)) {
    Write-Host "❌ Error: Binary not found at $BinaryPath." -ForegroundColor Red
    Write-Host "Please run 'cargo build --release' first." -ForegroundColor Yellow
    exit
}

# Check if service already exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "🔄 Service already exists. Stopping and removing..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName
}

# Create service
Write-Host "🚀 Creating service $ServiceName..." -ForegroundColor Cyan
sc.exe create $ServiceName binPath= $BinaryPath start= auto DisplayName= $DisplayName
sc.exe description $ServiceName $Description

# Start service
Write-Host "🏁 Starting service..." -ForegroundColor Green
Start-Service -Name $ServiceName

Write-Host "✅ Done! RetailEX-Logo-Connector is now running as a Windows Service." -ForegroundColor Green
