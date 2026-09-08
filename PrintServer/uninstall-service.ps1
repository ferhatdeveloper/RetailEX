# RetailEX Printer Servisini kaldırır.
param(
    [switch]$NonInteractive
)
& (Join-Path $PSScriptRoot "install-service.ps1") -Uninstall -NonInteractive:$NonInteractive
