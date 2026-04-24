-- merkez_db: merkezi kiracı / firma kaydı (VPN içi PostgreSQL)
-- PostgREST veya uygulama bu tabloyu okuyup hangi DB'ye bağlanılacağını seçebilir.

CREATE TABLE IF NOT EXISTS tenant_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  module          TEXT NOT NULL CHECK (module IN (
                    'tenant_registry',
                    'clinic',
                    'restaurant',
                    'hrm',
                    'retail',
                    'pdks'
                  )),
  connection_provider TEXT NOT NULL DEFAULT 'rest_api' CHECK (connection_provider IN ('db', 'rest_api')),
  rest_base_url   TEXT,
  db_host         TEXT,
  db_port         INTEGER,
  db_user         TEXT,
  db_pass         TEXT,
  db_sslmode      TEXT,
  database_name   TEXT NOT NULL,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_registry_active ON tenant_registry (is_active) WHERE is_active = true;

COMMENT ON TABLE tenant_registry IS 'Bulut kiracıları: kod, modül ve hedef PostgreSQL veritabanı adı';

-- Idempotent seed (code üzerinden)
INSERT INTO tenant_registry (code, display_name, module, database_name, notes)
VALUES
  ('merkez',        'Merkez kayıt',    'tenant_registry', 'merkez_db',       'Kiracı meta verisi'),
  ('aqua_beauty',   'Aqua Beauty',     'clinic',            'aqua_beauty',     'Güzellik'),
  ('dismarco_pdks', 'DISMARCO PDKS',  'pdks',              'dismarco_pdks',   'PDKS'),
  ('m10_pdks',      'M10 PDKS',       'pdks',              'm10_pdks',        'PDKS'),
  ('bestcom',       'BESTCOM',        'hrm',               'bestcom_db',      'İK / HRM'),
  ('siti_pdks',     'Siti PDKS',      'pdks',              'siti_pdks',       'PDKS'),
  ('pdks_demo',     'PDKS Demo',      'pdks',              'pdks_demo',       'Demo'),
  ('retailex_demo', 'RetailEX Demo', 'retail',            'retailex_demo',   'Demo')
ON CONFLICT (code) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  module        = EXCLUDED.module,
  connection_provider = COALESCE(NULLIF(EXCLUDED.connection_provider, ''), tenant_registry.connection_provider),
  rest_base_url = COALESCE(NULLIF(EXCLUDED.rest_base_url, ''), tenant_registry.rest_base_url),
  db_host       = COALESCE(NULLIF(EXCLUDED.db_host, ''), tenant_registry.db_host),
  db_port       = COALESCE(EXCLUDED.db_port, tenant_registry.db_port),
  db_user       = COALESCE(NULLIF(EXCLUDED.db_user, ''), tenant_registry.db_user),
  db_pass       = COALESCE(NULLIF(EXCLUDED.db_pass, ''), tenant_registry.db_pass),
  db_sslmode    = COALESCE(NULLIF(EXCLUDED.db_sslmode, ''), tenant_registry.db_sslmode),
  database_name = EXCLUDED.database_name,
  notes         = EXCLUDED.notes,
  updated_at    = now();
