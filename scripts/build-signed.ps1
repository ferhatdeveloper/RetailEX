# ============================================================
# RetailEX - DigiCert ONE Imzali Build Script
# Çalıştır: .\scripts\build-signed.ps1
#
# Gereksinimler:
#   1. smctl kurulu olmali (DigiCert Software Manager)
#   2. .env.signing dosyasi dolu olmali (veya env vars ayarli)
#   3. setup-digicert.ps1 en az bir kez calismis olmali
# ============================================================

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# ── 1. .env.signing yukle ────────────────────────────────────
$envFile = Join-Path $root ".env.signing"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#=\s]+)\s*=\s*(.+)\s*$") {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), "Process")
        }
    }
    Write-Host ".env.signing yuklendi" -ForegroundColor Gray
}

# ── 2. smctl kontrolu ─────────────────────────────────────────
$smctl = Get-Command smctl -ErrorAction SilentlyContinue
if (-not $smctl) {
    Write-Host "smctl bulunamadi. Once setup-digicert.ps1 calistirin." -ForegroundColor Red
    exit 1
}

# ── 3. Sertifika sync ─────────────────────────────────────────
Write-Host "Sertifikalar senkronize ediliyor..." -ForegroundColor Cyan
smctl windows certsync | Out-Null

# ── 4. Thumbprint al ──────────────────────────────────────────
$fingerprint = ($env:SM_CERT_FINGERPRINT -replace "[:\s-]", "").ToUpper()
$cert = Get-ChildItem -Path Cert:\CurrentUser\My |
        Where-Object { $_.Thumbprint.ToUpper() -eq $fingerprint } |
        Select-Object -First 1

if (-not $cert) {
    Write-Host "Sertifika cert store'da bulunamadi (fingerprint: $fingerprint)" -ForegroundColor Red
    Write-Host "setup-digicert.ps1 calistirarak sertifikalari senkronize edin." -ForegroundColor Yellow
    exit 1
}

$thumbprint = $cert.Thumbprint
Write-Host "Imzalama sertifikasi: $thumbprint  (Gecerli: $($cert.NotAfter))" -ForegroundColor Green

# ── 5. tauri.conf.json'a gecici olarak thumbprint ekle ────────
$confPath  = Join-Path $root "src-tauri\tauri.conf.json"
$confRaw   = Get-Content $confPath -Raw
$conf      = $confRaw | ConvertFrom-Json

$conf.bundle.windows | Add-Member -Force -MemberType NoteProperty -Name "certificateThumbprint" -Value $thumbprint
$conf.bundle.windows | Add-Member -Force -MemberType NoteProperty -Name "digestAlgorithm"       -Value "sha256"
$conf.bundle.windows | Add-Member -Force -MemberType NoteProperty -Name "timestampUrl"          -Value "http://timestamp.digicert.com"

$conf | ConvertTo-Json -Depth 10 | Set-Content $confPath -Encoding UTF8
Write-Host "tauri.conf.json guncellendi" -ForegroundColor Gray

# ── 6. Build ──────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Tauri imzali build basliyor ===" -ForegroundColor Cyan
Write-Host ""

try {
    npm run tauri build
    Write-Host ""
    Write-Host "=== Build basarili ===" -ForegroundColor Green

    $exePath = Join-Path $root "src-tauri\target\release\retailex.exe"
    if (Test-Path $exePath) {
        Write-Host "Uretilen exe: $exePath" -ForegroundColor Cyan

        # Imza dogrula
        $sig = Get-AuthenticodeSignature $exePath
        Write-Host "Imza durumu  : $($sig.Status)" -ForegroundColor $(if ($sig.Status -eq "Valid") { "Green" } else { "Yellow" })
        if ($sig.SignerCertificate) {
            Write-Host "Imzalayan    : $($sig.SignerCertificate.Subject)" -ForegroundColor Gray
        }
    }
} finally {
    # ── 7. tauri.conf.json'u temizle (thumbprint'i kaldir) ────
    $confClean = $confRaw | ConvertFrom-Json
    $confClean.bundle.windows.PSObject.Properties.Remove("certificateThumbprint")
    $confClean.bundle.windows.PSObject.Properties.Remove("digestAlgorithm")
    $confClean.bundle.windows.PSObject.Properties.Remove("timestampUrl")
    $confClean | ConvertTo-Json -Depth 10 | Set-Content $confPath -Encoding UTF8
    Write-Host "tauri.conf.json temizlendi (thumbprint kaldirildi)" -ForegroundColor Gray
}
