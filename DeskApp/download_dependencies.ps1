# RetailEX Offline Dependency Downloader
# This script downloads all required installers for an offline-capable setup.

$destDir = "d:\RetailEX\src-tauri\dependencies"
if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir }

$dependencies = @(
    @{
        Url  = "https://get.enterprisedb.com/postgresql/postgresql-15.6-1-windows-x64.exe"
        Name = "postgresql-15-setup.exe"
    },
    @{
        Url  = "https://github.com/microsoftarchive/redis/releases/download/win-3.0.504/Redis-x64-3.0.504.msi"
        Name = "redis-setup.msi"
    },
    @{
        Url  = "https://github.com/erlang/otp/releases/download/OTP-26.2.2/otp_win64_26.2.2.exe"
        Name = "erlang-setup.exe"
    },
    @{
        Url  = "https://github.com/rabbitmq/rabbitmq-server/releases/download/v3.12.12/rabbitmq-server-3.12.12.exe"
        Name = "rabbitmq-setup.exe"
    },
    @{
        Url  = "https://go.microsoft.com/fwlink/p/?LinkId=2124701"
        Name = "webview2-offline.exe"
    }
)

foreach ($dep in $dependencies) {
    $targetPath = Join-Path $destDir $dep.Name
    if (!(Test-Path $targetPath)) {
        Write-Host "Downloading $($dep.Name)..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $dep.Url -OutFile $targetPath
    }
    else {
        Write-Host "$($dep.Name) already exists, skipping." -ForegroundColor Green
    }
}

Write-Host "All dependencies downloaded to $destDir" -ForegroundColor White
