# RetailEX Printer Servisini kaldırır.
$ErrorActionPreference = "Stop"

foreach ($serviceName in @("RetailEX_Printer", "RetailEX_QrPrint")) {
    $existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if (-not $existing) {
        continue
    }

    Write-Host "Servis durduruluyor: $serviceName"
    Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName | Out-Null
    Write-Host "Servis kaldırıldı: $serviceName"
}
