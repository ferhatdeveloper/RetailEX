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
  ('merkez',     'Merkez kayıt',           'tenant_registry', 'merkez_db',     'Kiracı meta verisi'),
  ('aqua_beauty','Aqua Beauty',            'clinic',          'aqua_beauty_db', 'Klinik / güzellik'),
  ('qubocoffe',  'Qubo Coffee',            'restaurant',      'qubocoffe_db',  'Restoran'),
  ('dismarco',   'DISMARCO',               'hrm',             'dismarco_db',   'İK / HRM'),
  ('bestcom',    'BESTCOM',                'hrm',             'bestcom_db',    'İK / HRM')
ON CONFLICT (code) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  module        = EXCLUDED.module,
  database_name = EXCLUDED.database_name,
  notes         = EXCLUDED.notes,
  updated_at    = now();
