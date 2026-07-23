# AsinERP Portable Writer — hedef HDD/USB'ye basar ve volume.bind yazar.
# CD-ROM mantığı: serbest kopyala-yapıştır çalışmaz; yalnızca bu araçla basılan medya açılır.
#
# Kullanım:
#   .\AsinERP-Portable-Writer.ps1 -List
#   .\AsinERP-Portable-Writer.ps1 -SourceZip "C:\...\AsinERP-Portable-0.1.233.zip" -TargetDrive E:
#   .\AsinERP-Portable-Writer.ps1 -SourceDir "C:\...\AsinERP-Portable-0.1.233" -TargetDrive E:\AsinERP
#
# Not: Yönetici gerekmez (yazılabilir medya yeter). PowerShell ExecutionPolicy Bypass ile çalıştırın.

[CmdletBinding(DefaultParameterSetName = 'Burn')]
param(
    [Parameter(ParameterSetName = 'List')]
    [switch]$List,

    [Parameter(ParameterSetName = 'Burn')]
    [string]$SourceZip,

    [Parameter(ParameterSetName = 'Burn')]
    [string]$SourceDir,

    [Parameter(ParameterSetName = 'Burn', Mandatory = $true)]
    [string]$TargetDrive,

    [Parameter(ParameterSetName = 'Burn')]
    [string]$DestFolderName = 'AsinERP'
)

$ErrorActionPreference = 'Stop'
$BindSalt = 'AsinERP-Portable-Bind-v1'

function Get-BindSig([string]$Serial) {
    $norm = Normalize-VolumeSerial $Serial
    $payload = "$BindSalt|$norm"
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $hash = $sha.ComputeHash($bytes)
        return ([System.BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Normalize-VolumeSerial([string]$Raw) {
    $s = $Raw.Trim()
    if ($s.StartsWith('0x') -or $s.StartsWith('0X')) { $s = $s.Substring(2) }
    try {
        $n = [Convert]::ToUInt32($s, 16)
        return ('{0:X8}' -f $n)
    }
    catch {
        return $s.ToUpperInvariant()
    }
}

function Get-VolumeSerialHex([string]$RootPath) {
    # RootPath örn. E:\
    $letter = $RootPath.Substring(0, 1).ToUpperInvariant()
    $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$letter`:'" -ErrorAction Stop
    if (-not $disk -or [string]::IsNullOrWhiteSpace($disk.VolumeSerialNumber)) {
        throw "Volume serial okunamadı: $letter`:"
    }
    return (Normalize-VolumeSerial $disk.VolumeSerialNumber)
}

function Write-VolumeBind([string]$DestRoot, [string]$Serial) {
    $serialN = Normalize-VolumeSerial $Serial
    $written = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    $sig = Get-BindSig $serialN
    $body = @"
# AsinERP portable volume binding — writer ile basılır; elle kopyalamayın
v=1
serial=$serialN
written=$written
sig=$sig
"@
    $path = Join-Path $DestRoot 'volume.bind'
    [System.IO.File]::WriteAllText($path, $body, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[writer] volume.bind yazıldı → $path (serial=$serialN)"
}

function Show-RemovableDrives {
    Write-Host "Yazılabilir sürücüler (LogicalDisk):"
    Write-Host ("{0,-6} {1,-12} {2,-10} {3}" -f 'Harf', 'Serial', 'Tür', 'Etiket / Boyut')
    Get-CimInstance Win32_LogicalDisk | Where-Object {
        $_.DriveType -in 2, 3  # Removable, Local Disk
    } | ForEach-Object {
        $serial = if ($_.VolumeSerialNumber) { $_.VolumeSerialNumber } else { '-' }
        $type = switch ($_.DriveType) { 2 { 'USB/Rem' } 3 { 'HDD/SSD' } default { $_.DriveType } }
        $freeGb = if ($_.FreeSpace) { '{0:N1} GB bos' -f ($_.FreeSpace / 1GB) } else { '' }
        $label = if ($_.VolumeName) { $_.VolumeName } else { '' }
        Write-Host ("{0,-6} {1,-12} {2,-10} {3} {4}" -f $_.DeviceID, $serial, $type, $label, $freeGb)
    }
}

if ($List) {
    Show-RemovableDrives
    exit 0
}

# --- Burn ---
if (-not $SourceDir -and -not $SourceZip) {
    throw 'SourceZip veya SourceDir gerekli.'
}
if ($SourceZip -and -not (Test-Path -LiteralPath $SourceZip)) {
    throw "Zip bulunamadı: $SourceZip"
}
if ($SourceDir -and -not (Test-Path -LiteralPath $SourceDir)) {
    throw "Klasör bulunamadı: $SourceDir"
}

$target = $TargetDrive.TrimEnd('\', '/')
if ($target -match '^[A-Za-z]:$') {
    $driveRoot = "$($target.ToUpperInvariant())\"
    $destRoot = Join-Path $driveRoot $DestFolderName
}
elseif ($target -match '^[A-Za-z]:') {
    $driveRoot = "$($target.Substring(0,1).ToUpperInvariant()):\"
    $destRoot = $target
    if (-not $destRoot.EndsWith('\') -and -not (Test-Path -LiteralPath $destRoot)) {
        # path without trailing slash is fine
    }
}
else {
    throw "TargetDrive sürücü harfi olmalı (örn. E: veya E:\AsinERP). Gelen: $TargetDrive"
}

$serial = Get-VolumeSerialHex $driveRoot
Write-Host "[writer] Hedef sürücü: $driveRoot  serial=$serial"
Write-Host "[writer] Hedef klasör: $destRoot"

if (Test-Path -LiteralPath $destRoot) {
    Write-Host "[writer] Mevcut klasör temizleniyor..."
    Remove-Item -LiteralPath $destRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $destRoot -Force | Out-Null

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("AsinERP-Portable-Burn-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage -Force | Out-Null
try {
    if ($SourceZip) {
        Write-Host "[writer] Zip açılıyor..."
        Expand-Archive -LiteralPath $SourceZip -DestinationPath $stage -Force
        # Zip kökünde dosyalar veya tek klasör olabilir
        $children = Get-ChildItem -LiteralPath $stage
        if ($children.Count -eq 1 -and $children[0].PSIsContainer) {
            Copy-Item -Path (Join-Path $children[0].FullName '*') -Destination $destRoot -Recurse -Force
        }
        else {
            Copy-Item -Path (Join-Path $stage '*') -Destination $destRoot -Recurse -Force
        }
    }
    else {
        Write-Host "[writer] Klasör kopyalanıyor..."
        Copy-Item -Path (Join-Path $SourceDir '*') -Destination $destRoot -Recurse -Force
    }

    # Writer'ı da medyaya koy (yeniden basım için)
    $tools = Join-Path $destRoot 'tools'
    New-Item -ItemType Directory -Path $tools -Force | Out-Null
    $self = $MyInvocation.MyCommand.Path
    if ($self) {
        Copy-Item -LiteralPath $self -Destination (Join-Path $tools 'AsinERP-Portable-Writer.ps1') -Force
    }

    # Eski/yanlış bind varsa üzerine yaz
    Write-VolumeBind -DestRoot $destRoot -Serial $serial

    # portable.dat yoksa oluştur
    $pd = Join-Path $destRoot 'portable.dat'
    if (-not (Test-Path -LiteralPath $pd)) {
        [System.IO.File]::WriteAllText($pd, "AsinERP portable=1`n", [System.Text.UTF8Encoding]::new($false))
    }

    Write-Host ""
    Write-Host "[writer] Tamam. Çalıştırın: $(Join-Path $destRoot 'AsinERP.exe')"
    Write-Host "[writer] Bu kopya yalnızca serial=$serial olan diskte açılır."
}
finally {
    if (Test-Path -LiteralPath $stage) {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
}
