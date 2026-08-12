# ============================================================
# RetailEX - DigiCert ONE ile imzali Tauri build (sarmalayıcı)
# Calistir: .\scripts\build-signed.ps1
#
# Asil is: npm run tauri:build  →  tauri-windows-signing-prep.mjs
#   .env.signing + SM_* / WINDOWS_CODESIGN_* ile otomatik thumbprint
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$envFile = Join-Path $root ".env.signing"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#=\s]+)\s*=\s*(.+)\s*$") {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), "Process")
        }
    }
    Write-Host ".env.signing yuklendi" -ForegroundColor Gray
}

$smctl = Get-Command smctl -ErrorAction SilentlyContinue
if ($smctl -and $env:SM_CERT_FINGERPRINT) {
    Write-Host "smctl windows certsync..." -ForegroundColor Cyan
    smctl windows certsync | Out-Null
}

Write-Host "=== npm run tauri:build (imza hazirligi dahil) ===" -ForegroundColor Cyan
npm run tauri:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$exePath = Join-Path $root "DeskApp\target\release\retailex.exe"
if (Test-Path $exePath) {
    $sig = Get-AuthenticodeSignature $exePath
    Write-Host "Imza durumu: $($sig.Status)" -ForegroundColor $(if ($sig.Status -eq "Valid") { "Green" } else { "Yellow" })
}
