# RetailEX Printer Servisi kurulumu
# Yönetici PowerShell: .\install-service.ps1
# Kurulum sihirbazı:    .\install-service.ps1 -Install -NonInteractive
param(
    [string]$ExePath = "",
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Status,
    [switch]$NonInteractive,
    [switch]$SkipRequirementCheck
)

$ErrorActionPreference = "Stop"
$serviceName = "RetailEX_Printer"
$displayName = "RetailEX Printer Servisi"
$description = "RetailEX mutfak, hesap ve QR siparişlerini alır; 80mm fiş yazdırır."
$legacyNames = @("RetailEX_QrPrint", "RetailEX_PrintServer")
$installDir = "C:\ProgramData\RetailEX\QrPrint\Service"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not ($Install -or $Uninstall -or $Status)) {
    $Install = $true
}

function Write-Info([string]$message) {
    Write-Host $message
}

function Test-Administrator {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-CompleteServiceExe([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path)) {
        return $false
    }
    $dll = [System.IO.Path]::ChangeExtension($path, ".dll")
    $hostPolicy = Join-Path (Split-Path $path -Parent) "hostfxr.dll"
    $coreClr = Join-Path (Split-Path $path -Parent) "coreclr.dll"
    if (Test-Path -LiteralPath $dll) {
        return $true
    }
    # Özerk (self-contained) tek exe: native host dosyaları yanındadır
    return (Test-Path -LiteralPath $hostPolicy) -or (Test-Path -LiteralPath $coreClr)
}

function Get-DotnetExe {
    @(
        (Join-Path $env:LOCALAPPDATA "dotnet\dotnet.exe"),
        (Join-Path $env:ProgramFiles "dotnet\dotnet.exe")
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Find-ServiceProject([string]$start) {
    $dir = $start
    for ($i = 0; $i -lt 8; $i++) {
        $proj = Join-Path $dir "QrPrintDesktop.Service\QrPrintDesktop.Service.csproj"
        if (Test-Path $proj) { return $proj }
        $parent = Split-Path $dir -Parent
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $dir) { break }
        $dir = $parent
    }
    return $null
}

function Find-PackagedServiceExe([string]$start) {
    $candidates = @()
    if ($ExePath) { $candidates += $ExePath }
    $candidates += @(
        (Join-Path $start "Service\RetailEX_Printer_Service.exe"),
        (Join-Path $start "RetailEX_Printer_Service.exe"),
        (Join-Path $installDir "RetailEX_Printer_Service.exe")
    )
    $dir = $start
    for ($i = 0; $i -lt 6; $i++) {
        $candidates += Join-Path $dir "QrPrintDesktop.Service\bin\Release\net9.0-windows\win-x64\RetailEX_Printer_Service.exe"
        $candidates += Join-Path $dir "QrPrintDesktop.Service\bin\Release\net9.0-windows\RetailEX_Printer_Service.exe"
        $candidates += Join-Path $dir "QrPrintDesktop.App\bin\Release\net9.0-windows\Service\RetailEX_Printer_Service.exe"
        $parent = Split-Path $dir -Parent
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $dir) { break }
        $dir = $parent
    }
    return $candidates | Where-Object { Test-CompleteServiceExe $_ } | Select-Object -First 1
}

function Test-SystemRequirements {
    $errors = [System.Collections.Generic.List[string]]::new()

    if (-not (Test-Administrator)) {
        $errors.Add("Yönetici yetkisi gerekli. Kurulumu 'Yönetici olarak çalıştır' ile açın.")
    }

    if (-not [Environment]::Is64BitOperatingSystem) {
        $errors.Add("64-bit Windows 10 veya Windows 11 gerekli.")
    }

    $os = [Environment]::OSVersion.Version
    if ($os.Major -lt 10) {
        $errors.Add("Windows 10 (sürüm 1607) veya Windows 11 gerekli.")
    }

    $spooler = Get-Service -Name "Spooler" -ErrorAction SilentlyContinue
    if (-not $spooler) {
        $errors.Add("Yazdırma Biriktiricisi (Print Spooler) bulunamadı.")
    }
    else {
        if ($spooler.StartType -eq "Disabled") {
            try {
                Set-Service -Name "Spooler" -StartupType Automatic -ErrorAction Stop
            }
            catch {
                $errors.Add("Yazdırma Biriktiricisi devre dışı ve açılamadı.")
            }
        }
        if ((Get-Service Spooler).Status -ne "Running") {
            try {
                Start-Service -Name "Spooler" -ErrorAction Stop
            }
            catch {
                $errors.Add("Yazdırma Biriktiricisi başlatılamadı: $($_.Exception.Message)")
            }
        }
    }

    $driveName = $env:SystemDrive.TrimEnd("\")
    $drive = Get-PSDrive -Name $driveName.TrimEnd(":") -ErrorAction SilentlyContinue
    if ($drive -and $drive.Free -lt 400MB) {
        $errors.Add("Kurulum için en az 400 MB boş disk gerekli.")
    }

    return $errors
}

function Remove-NamedService([string]$name) {
    $existing = Get-Service -Name $name -ErrorAction SilentlyContinue
    if (-not $existing) { return }
    Write-Info "Mevcut servis durduruluyor: $name"
    Stop-Service $name -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    sc.exe delete $name | Out-Null
    Start-Sleep -Seconds 2
}

function Wait-ServiceRunning([string]$name, [int]$seconds = 20) {
    $deadline = (Get-Date).AddSeconds($seconds)
    do {
        $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq "Running") {
            return $svc
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    return Get-Service -Name $name -ErrorAction SilentlyContinue
}

function Install-PrinterService {
    if (-not $SkipRequirementCheck) {
        Write-Info "Sistem gereksinimleri kontrol ediliyor..."
        $reqErrors = Test-SystemRequirements
        if ($reqErrors.Count -gt 0) {
            Write-Host ""
            Write-Host "Kurulum durdu. Sistem gereksinimleri karşılanmadı:" -ForegroundColor Red
            $reqErrors | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
            exit 2
        }
        Write-Info "Gereksinimler uygun: Windows 64-bit, yönetici, Yazdırma Biriktiricisi."
    }

    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    New-Item -ItemType Directory -Force -Path "C:\ProgramData\RetailEX\QrPrint" | Out-Null

    $exe = $null
    $dotnetExe = Get-DotnetExe
    $proj = Find-ServiceProject $root
    $packaged = Find-PackagedServiceExe $root

    # Müşteri kurulumunda SDK yok; paketlenmiş özerk exe kullanılır.
    if ($packaged -and -not $proj) {
        $exe = (Resolve-Path $packaged).Path
        Write-Info "Paket servis kullanılacak (SDK yok)."
    }
    elseif ($dotnetExe -and $proj) {
        Write-Info "Özerk (self-contained) servis yayınlanıyor..."
        & $dotnetExe publish $proj -c Release -r win-x64 --self-contained true -o $installDir --nologo
        $published = Join-Path $installDir "RetailEX_Printer_Service.exe"
        if ($LASTEXITCODE -eq 0 -and (Test-Path $published)) {
            $exe = $published
        }
    }

    if (-not $exe) {
        if ($packaged) {
            $builtDir = Split-Path $packaged -Parent
            Write-Info "Derleme kopyalanıyor: $builtDir -> $installDir"
            Copy-Item -Path (Join-Path $builtDir "*") -Destination $installDir -Recurse -Force
            $exe = Join-Path $installDir "RetailEX_Printer_Service.exe"
        }
    }

    if (-not (Test-CompleteServiceExe $exe)) {
        Write-Error "Servis exe bulunamadı. RetailEX_Printer_Service.exe kurulum klasöründe olmalı."
    }

    $exe = (Resolve-Path $exe).Path
    Write-Info "Servis exe: $exe"

    foreach ($name in (@($serviceName) + $legacyNames)) {
        Remove-NamedService $name
    }

    Write-Info "Windows servisi kuruluyor: $displayName"
    New-Service -Name $serviceName `
        -BinaryPathName "`"$exe`"" `
        -DisplayName $displayName `
        -Description $description `
        -StartupType Automatic | Out-Null

    sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
    sc.exe config $serviceName start= delayed-auto | Out-Null
    sc.exe config $serviceName obj= LocalSystem | Out-Null

    Write-Info "Servis başlatılıyor..."
    try {
        Start-Service $serviceName -ErrorAction Stop
    }
    catch {
        Write-Host "Start-Service uyarısı: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    $svc = Wait-ServiceRunning $serviceName
    Write-Info "Servis durumu: $($svc.Status)  ($displayName)"
    Write-Info "Config: C:\ProgramData\RetailEX\QrPrint\settings.json"
    Write-Info "Log:    C:\ProgramData\RetailEX\QrPrint\qrprint-service.log"

    if (-not $svc -or $svc.Status -ne "Running") {
        Write-Host ""
        Write-Host "Servis çalışmıyor. Event Viewer > Windows Günlükleri > Uygulama kaydına bakın." -ForegroundColor Red
        $log = "C:\ProgramData\RetailEX\QrPrint\qrprint-service.log"
        if (Test-Path $log) {
            Write-Host "---- son log ----" -ForegroundColor Yellow
            Get-Content $log -Tail 40
        }
        if (-not $NonInteractive) {
            Read-Host "Kapatmak için Enter"
        }
        exit 1
    }

    Write-Host "RetailEX Printer Servisi çalışıyor." -ForegroundColor Green
}

function Uninstall-PrinterService {
    if (-not (Test-Administrator)) {
        Write-Error "Kaldırma için yönetici yetkisi gerekli."
    }
    foreach ($name in (@($serviceName) + $legacyNames)) {
        Remove-NamedService $name
        Write-Info "Kaldırıldı (varsa): $name"
    }
}

function Show-PrinterServiceStatus {
    $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Host "Servis kurulu değil: $serviceName"
        return
    }
    $svc | Format-List Name, DisplayName, Status, StartType
    Write-Host "Config: C:\ProgramData\RetailEX\QrPrint\settings.json"
    Write-Host "Log:    C:\ProgramData\RetailEX\QrPrint\qrprint-service.log"
    if ($svc.Status -ne "Running") { exit 1 }
}

if ($Uninstall) { Uninstall-PrinterService }
if ($Status) { Show-PrinterServiceStatus }
if ($Install) { Install-PrinterService }
