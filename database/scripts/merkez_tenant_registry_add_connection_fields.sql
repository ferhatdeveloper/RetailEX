-- Mevcut merkez_db.tenant_registry tablosuna bağlantı alanları ekler.
-- Güvenli tekrar çalıştırma: IF NOT EXISTS kullanılır.

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS connection_provider TEXT;

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS rest_base_url TEXT;

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS db_host TEXT;

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS db_port INTEGER;

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS db_user TEXT;

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS db_pass TEXT;

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS db_sslmode TEXT;

UPDATE tenant_registry
SET connection_provider = 'rest_api'
WHERE connection_provider IS NULL OR connection_provider = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_registry_connection_provider_check'
  ) THEN
    ALTER TABLE tenant_registry
      ADD CONSTRAINT tenant_registry_connection_provider_check
      CHECK (connection_provider IN ('db', 'rest_api'));
  END IF;
END $$;

ALTER TABLE tenant_registry
  ALTER COLUMN connection_provider SET DEFAULT 'rest_api';

ALTER TABLE tenant_registry
  ALTER COLUMN connection_provider SET NOT NULL;
