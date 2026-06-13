-- merkez_db.tenant_registry: kiracı Logo Tiger REST API tabanı (değişken — sabit IP yok)
-- Örnek: http://185.206.80.132:32001/api/v1

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS logo_rest_api_url TEXT;

COMMENT ON COLUMN tenant_registry.logo_rest_api_url IS
  'Logo Objects REST API base URL (/api/v1). Kiracı başına farklı sunucu olabilir.';

NOTIFY pgrst, 'reload schema';
