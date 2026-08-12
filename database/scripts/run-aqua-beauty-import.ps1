# aqua.sql + PostgREST anon/verify_login — tek akışta aqua_beauty'ye yükler
# Kullanım (repo kökünden):
#   .\database\scripts\run-aqua-beauty-import.ps1
#   .\database\scripts\run-aqua-beauty-import.ps1 -PostgresContainer saas_postgres -DbName aqua_beauty

param(
  [string]$PostgresContainer = 'saas_postgres',
  [string]$DbName = 'aqua_beauty',
  [string]$PostgresUser = 'postgres',
  [switch]$RecreateDatabase,
  [switch]$GenerateOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$aquaDump = Join-Path $repoRoot 'aqua.sql'
$postgrestSql = Join-Path $PSScriptRoot 'aqua_beauty_postgrest.sql'
$combinedOut = Join-Path $PSScriptRoot 'aqua_beauty_complete.sql'

if (-not (Test-Path $aquaDump)) {
  throw "Bulunamadı: $aquaDump"
}
if (-not (Test-Path $postgrestSql)) {
  throw "Bulunamadı: $postgrestSql"
}

Write-Host "Birlesik SQL uretiliyor: $combinedOut"
$header = @"
-- aqua_beauty_complete.sql (otomatik üretim)
-- Kaynak: aqua.sql + database/scripts/aqua_beauty_postgrest.sql
-- Üretim: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

"@
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($combinedOut, $header, $utf8)
[System.IO.File]::AppendAllText($combinedOut, (Get-Content -Path $aquaDump -Raw -Encoding UTF8), $utf8)
[System.IO.File]::AppendAllText(
  $combinedOut,
  "`n-- ========== PostgREST (anon + verify_login) ==========`n" + (Get-Content -Path $postgrestSql -Raw -Encoding UTF8),
  $utf8
)

if ($GenerateOnly) {
  Write-Host "Sadece dosya uretildi. Import icin:"
  Write-Host "  Get-Content '$combinedOut' -Raw | docker exec -i $PostgresContainer psql -U $PostgresUser -d $DbName -v ON_ERROR_STOP=1"
  exit 0
}

if ($RecreateDatabase) {
  Write-Host "Veritabanı yeniden oluşturuluyor: $DbName"
  docker exec -i $PostgresContainer psql -U $PostgresUser -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DbName;"
  docker exec -i $PostgresContainer psql -U $PostgresUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DbName;"
}

Write-Host "Import başlıyor ($DbName)..."
Get-Content -Path $combinedOut -Encoding UTF8 -Raw | docker exec -i $PostgresContainer psql -U $PostgresUser -d $DbName -v ON_ERROR_STOP=1

Write-Host "PostgREST konteyneri yeniden başlatılıyor..."
docker restart "saas_postgrest_aqua_beauty" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Warning "saas_postgrest_aqua_beauty restart atlandı (konteyner yok olabilir)."
}

Write-Host "Tamam. Kontrol:"
Write-Host "  docker exec -it $PostgresContainer psql -U $PostgresUser -d $DbName -c `"SELECT COUNT(*) FROM public.firms;`""
