# CI: Portable stage + final EXE Authenticode imza (secret varsa).
# Env: WINDOWS_CODESIGN_THUMBPRINT veya PFX magazada; WINDOWS_CODESIGN_DISABLE=1 ise atla.
# ONEMLI: em-dash / Turkce UTF-8 kullanma - PS 5.1 BOM'suz UTF-8'i bozar (parse hatasi).
param(
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $false)]
  [string[]]$Paths
)

$ErrorActionPreference = "Stop"

# -File cagrisinda dizi bozulursa tek string gelmis olabilir
if ($Paths.Count -eq 1 -and $Paths[0] -match ';|,') {
  $Paths = @($Paths[0] -split '[;,]' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

if ($env:WINDOWS_CODESIGN_DISABLE -eq "1" -or $env:WINDOWS_CODESIGN_DISABLE -eq "true") {
  Write-Host "[sign-portable] WINDOWS_CODESIGN_DISABLE - atlandi."
  exit 0
}

$thumb = ($env:WINDOWS_CODESIGN_THUMBPRINT -as [string]).Trim()
if (-not $thumb) {
  $thumb = ($env:WINDOWS_CERTIFICATE_THUMBPRINT -as [string]).Trim()
}
if (-not $thumb -and $env:SM_CERT_FINGERPRINT) {
  $thumb = $env:SM_CERT_FINGERPRINT.Trim()
}

$signtool = @(
  "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
  "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
) | Get-ChildItem -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName

if (-not $signtool) {
  Write-Warning "[sign-portable] signtool.exe yok - imza atlandi."
  exit 0
}

if (-not $thumb) {
  # Magazadaki tek kod-imza sertifikasi
  $certs = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue
  if ($certs.Count -eq 1) { $thumb = $certs[0].Thumbprint }
  elseif ($certs.Count -gt 1) {
    Write-Warning "[sign-portable] Birden fazla kod-imza sertifikasi; WINDOWS_CODESIGN_THUMBPRINT gerekli."
    exit 0
  }
}

if (-not $thumb) {
  Write-Host "[sign-portable] Sertifika yok - atlandi."
  exit 0
}

$ts = "http://timestamp.digicert.com"
foreach ($p in $Paths) {
  if (-not (Test-Path -LiteralPath $p)) {
    Write-Warning "[sign-portable] Yok: $p"
    continue
  }
  Write-Host "[sign-portable] Imzalaniyor: $p"
  & $signtool sign /fd sha256 /tr $ts /td sha256 /sha1 $thumb $p
  if ($LASTEXITCODE -ne 0) { throw "signtool failed: $p exit $LASTEXITCODE" }
  & $signtool verify /pa $p | Out-Host
}
Write-Host "[sign-portable] Tamam."
