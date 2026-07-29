-- merkez_db.tenant_registry: Logo REST firma / dönem / veritabanı (kiracı başına)
-- URL: logo_rest_api_url (merkez_tenant_registry_add_logo_rest_fields.sql)
-- Çalıştır: psql -d merkez_db -f database/scripts/merkez_tenant_registry_add_logo_firm_fields.sql

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS logo_firm_nr INTEGER,
  ADD COLUMN IF NOT EXISTS logo_period_nr INTEGER,
  ADD COLUMN IF NOT EXISTS logo_db TEXT;

COMMENT ON COLUMN tenant_registry.logo_firm_nr IS
  'Logo Tiger firma numarası (örn. 401). RetailEX ERP firm_nr ile aynı olmak zorunda değil.';
COMMENT ON COLUMN tenant_registry.logo_period_nr IS
  'Logo Tiger dönem numarası (örn. 1).';
COMMENT ON COLUMN tenant_registry.logo_db IS
  'Logo REST logodb adı (CompanyLogin / token için).';

NOTIFY pgrst, 'reload schema';
