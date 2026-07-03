# PostgreSQL template1 collation uyumsuzluğu (Windows güncellemesi sonrası)
# Kullanım (yönetici gerekmez; postgres süper kullanıcı yeterli):
#   .\scripts\fix-pg-collation-windows.ps1
#   .\scripts\fix-pg-collation-windows.ps1 -PgBin "C:\Program Files\PostgreSQL\16\bin"

param(
    [string]$HostName = "127.0.0.1",
    [int]$Port = 5432,
    [string]$User = "postgres",
    [string]$PgBin = ""
)

function Resolve-Psql {
    if ($PgBin -and (Test-Path (Join-Path $PgBin "psql.exe"))) {
        return Join-Path $PgBin "psql.exe"
    }
    $candidates = @(
        "C:\Program Files\PostgreSQL\18\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return $p }
    }
    throw "psql.exe bulunamadı. -PgBin ile PostgreSQL bin klasörünü verin."
}

$psql = Resolve-Psql
Write-Host "psql: $psql"

if (-not $env:PGPASSWORD) {
    $secure = Read-Host "PostgreSQL şifresi ($User)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

$conn = "host=$HostName port=$Port user=$User dbname=postgres"
$sql = @"
ALTER DATABASE postgres REFRESH COLLATION VERSION;
ALTER DATABASE template1 REFRESH COLLATION VERSION;
"@

Write-Host "Collation sürümleri yenileniyor (postgres, template1)..."
& $psql $conn -v ON_ERROR_STOP=1 -c $sql
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Tamam. RetailEX kurulum sihirbazında veritabanı oluşturmayı tekrar deneyin."
