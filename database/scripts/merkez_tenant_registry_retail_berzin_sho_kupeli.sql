-- merkez_db: üç perakende mağaza kiracısı (doğrudan PostgreSQL — connection_provider = db)
-- Önkoşul: tenant_registry tablosu (bkz. merkez_tenant_registry.sql + merkez_tenant_registry_add_connection_fields.sql)
--
-- Şifreyi repoya koymayın.
--
-- psql yüklüyse (PowerShell):
--   $env:PGPASSWORD = '...'
--   psql -h 72.60.182.107 -p 5432 -U postgres -d merkez_db -v ON_ERROR_STOP=1 `
--     -v tenant_pg_pass='...' -f database/scripts/merkez_tenant_registry_retail_berzin_sho_kupeli.sql
--
-- psql yoksa (Node — önce kiracı DB'lerini UTF8 oluşturur, sonra merkez_db'ye tenant yazar):
--   $env:PGHOST='72.60.182.107'; $env:PGDATABASE='merkez_db'; $env:PGUSER='postgres'; $env:PGPASSWORD='...'
--   npm run db:merkez:tenant-retail-seed
--   CREATE DATABASE için bakım bağlantısı: PG_MAINTENANCE_DATABASE=postgres (varsayılan)
--   Sadece tenant: SKIP_CREATE_DBS=1
--
-- psql (PATH yoksa örnek):
--   & 'C:\Program Files\PostgreSQL\16\bin\psql.exe' ...
--
-- Linux/macOS:
--   PGPASSWORD='...' psql -h 72.60.182.107 -U postgres -d merkez_db -v ON_ERROR_STOP=1 \
--     -v tenant_pg_pass='...' -f database/scripts/merkez_tenant_registry_retail_berzin_sho_kupeli.sql

SET client_encoding = 'UTF8';

INSERT INTO tenant_registry (
  code,
  display_name,
  module,
  connection_provider,
  rest_base_url,
  db_host,
  db_port,
  db_user,
  db_pass,
  db_sslmode,
  database_name,
  notes,
  is_active
) VALUES
  (
    'berzin_com',
    'Berzin Company — Mağaza',
    'retail',
    'db',
    NULL,
    '72.60.182.107',
    5432,
    'postgres',
    :'tenant_pg_pass',
    'prefer',
    'berzin_com',
    'Perakende; hedef DB: berzin_com',
    true
  ),
  (
    'sho_aksesuar',
    'Sho Aksesuar — Mağaza',
    'retail',
    'db',
    NULL,
    '72.60.182.107',
    5432,
    'postgres',
    :'tenant_pg_pass',
    'prefer',
    'sho_aksesuar',
    'Perakende; hedef DB: sho_aksesuar',
    true
  ),
  (
    'kupeli',
    'Küpeli — Mağaza',
    'retail',
    'db',
    NULL,
    '72.60.182.107',
    5432,
    'postgres',
    :'tenant_pg_pass',
    'prefer',
    'kupeli',
    'Perakende; hedef DB: kupeli',
    true
  )
ON CONFLICT (code) DO UPDATE SET
  display_name          = EXCLUDED.display_name,
  module                = EXCLUDED.module,
  connection_provider   = EXCLUDED.connection_provider,
  rest_base_url         = EXCLUDED.rest_base_url,
  db_host               = EXCLUDED.db_host,
  db_port               = EXCLUDED.db_port,
  db_user               = EXCLUDED.db_user,
  db_pass               = EXCLUDED.db_pass,
  db_sslmode            = EXCLUDED.db_sslmode,
  database_name         = EXCLUDED.database_name,
  notes                 = EXCLUDED.notes,
  is_active             = EXCLUDED.is_active,
  updated_at            = now();

SELECT code, display_name, module, connection_provider, db_host, db_port, database_name, is_active
FROM tenant_registry
WHERE code IN ('berzin_com', 'sho_aksesuar', 'kupeli')
ORDER BY code;
