# ============================================================
# RetailEX - DigiCert ONE / KeyLocker Setup Script
# Çalıştır: .\scripts\setup-digicert.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# ── 1. smctl kurulum kontrolü ────────────────────────────────
$smctl = Get-Command smctl -ErrorAction SilentlyContinue
if (-not $smctl) {
    Write-Host ""
    Write-Host "smctl (DigiCert Software Manager) bulunamadi." -ForegroundColor Yellow
    Write-Host "Asagidaki linkten indirip kurun:" -ForegroundColor Yellow
    Write-Host "  https://one.digicert.com/signingmanager/software-manager" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Kurulum sonrasi bu scripti tekrar calistirin."
    exit 1
}

Write-Host "smctl bulundu: $($smctl.Source)" -ForegroundColor Green

# ── 2. Ortam degiskenleri ─────────────────────────────────────
$envFile = Join-Path $PSScriptRoot "..\env.signing"
if (-not (Test-Path $envFile)) {
    $envFile = Join-Path $PSScriptRoot "..\.env.signing"
}

if (Test-Path $envFile) {
    Write-Host "Ortam degiskenleri yukleniyor: $envFile" -ForegroundColor Cyan
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^\s*([^#=\s]+)\s*=\s*(.+)\s*$") {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), "Process")
            Write-Host "  $($Matches[1]) ayarlandi" -ForegroundColor Gray
        }
    }
} else {
    Write-Host ""
    Write-Host "UYARI: .env.signing dosyasi bulunamadi." -ForegroundColor Yellow
    Write-Host "  .env.signing.example dosyasini kopyalayip doldurun:" -ForegroundColor Yellow
    Write-Host "  copy .env.signing.example .env.signing" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Ortam degiskenleri zaten ayarlanmissa devam edebilirsiniz." -ForegroundColor Gray
}

# ── 3. Gerekli degisken kontrolu ──────────────────────────────
$required = @("SM_API_KEY", "SM_CERT_FINGERPRINT", "SM_CLIENT_CERT_FILE", "SM_CLIENT_CERT_PASSWORD", "SM_HOST")
$missing  = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_, "Process") }

if ($missing) {
    Write-Host ""
    Write-Host "Eksik ortam degiskenleri:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

# ── 4. smctl ile giri yapin ───────────────────────────────────
Write-Host ""
Write-Host "DigiCert ONE'a baglaniliyor..." -ForegroundColor Cyan
smctl credentials save --api-key $env:SM_API_KEY `
                       --client-cert-file $env:SM_CLIENT_CERT_FILE `
                       --client-cert-password $env:SM_CLIENT_CERT_PASSWORD `
                       --sm-host $env:SM_HOST

# ── 5. Sertifikalari Windows cert store'a senkronize et ───────
Write-Host ""
Write-Host "Sertifikalar Windows cert store'a senkronize ediliyor..." -ForegroundColor Cyan
smctl windows certsync
Write-Host "Senkronizasyon tamamlandi." -ForegroundColor Green

# ── 6. Thumbprint'i al ────────────────────────────────────────
Write-Host ""
Write-Host "Sertifika thumbprint aliniyor..." -ForegroundColor Cyan

# Cert store'dan SM_CERT_FINGERPRINT ile eslesen sertifikayi bul
$fingerprint = $env:SM_CERT_FINGERPRINT -replace "[:\s-]", ""  # normalize
$cert = Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object {
    $_.Thumbprint -ieq $fingerprint
}

if (-not $cert) {
    # Alternatif: tum sertifikalari listele
    Write-Host "Fingerprint ile sertifika bulunamadi. Mevcut sertifikalar:" -ForegroundColor Yellow
    Get-ChildItem -Path Cert:\CurrentUser\My | Select-Object Thumbprint, Subject, NotAfter | Format-Table
    Write-Host "Uygun thumbprint'i tauri.conf.json icine manuel girin." -ForegroundColor Yellow
    exit 1
}

$thumbprint = $cert.Thumbprint
Write-Host "Thumbprint bulundu: $thumbprint" -ForegroundColor Green
Write-Host "Gecerlilik suresi: $($cert.NotAfter)" -ForegroundColor Gray

# ── 7. tauri.conf.json guncelle ───────────────────────────────
$confPath = Join-Path $PSScriptRoot "..\src-tauri\tauri.conf.json"
$conf     = Get-Content $confPath -Raw | ConvertFrom-Json

$conf.bundle.windows | Add-Member -Force -MemberType NoteProperty -Name "certificateThumbprint" -Value $thumbprint
$conf.bundle.windows | Add-Member -Force -MemberType NoteProperty -Name "digestAlgorithm"       -Value "sha256"
$conf.bundle.windows | Add-Member -Force -MemberType NoteProperty -Name "timestampUrl"          -Value "http://timestamp.digicert.com"

$conf | ConvertTo-Json -Depth 10 | Set-Content $confPath -Encoding UTF8

Write-Host ""
Write-Host "tauri.conf.json guncellendi:" -ForegroundColor Green
Write-Host "  certificateThumbprint = $thumbprint" -ForegroundColor Cyan
Write-Host ""
Write-Host "Imzali build icin:" -ForegroundColor Green
Write-Host "  .\scripts\build-signed.ps1" -ForegroundColor Cyan
