-- merkez_db.tenant_registry: kiracı Logo Tiger REST API tabanı (değişken — sabit IP yok)
-- Örnek: http://185.206.80.132:32001/api/v1

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS logo_rest_api_url TEXT;

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS logo_firm_nr INTEGER,
  ADD COLUMN IF NOT EXISTS logo_period_nr INTEGER,
  ADD COLUMN IF NOT EXISTS logo_db TEXT;

COMMENT ON COLUMN tenant_registry.logo_rest_api_url IS
  'Logo Objects REST API base URL (/api/v1). Kiracı başına farklı sunucu olabilir.';
COMMENT ON COLUMN tenant_registry.logo_firm_nr IS
  'Logo Tiger firma numarası (örn. 401). RetailEX ERP firm_nr ile aynı olmak zorunda değil.';
COMMENT ON COLUMN tenant_registry.logo_period_nr IS
  'Logo Tiger dönem numarası (örn. 1).';
COMMENT ON COLUMN tenant_registry.logo_db IS
  'Logo REST logodb adı (CompanyLogin / token için).';

NOTIFY pgrst, 'reload schema';
