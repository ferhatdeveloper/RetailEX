-- Settings tablosu oluÅŸtur (eÄŸer yoksa)
CREATE TABLE IF NOT EXISTS settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- use_dynamic_menu parametresini ekle
INSERT INTO settings (key, value, description)
VALUES (
  'use_dynamic_menu',
  'false',
  'Dinamik menÃ¼ kullanÄ±mÄ±nÄ± kontrol eder. true = VeritabanÄ±ndan menÃ¼ yÃ¼kle, false = Statik menÃ¼ kullan'
)
ON CONFLICT (key) DO UPDATE
SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Index ekle
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- RLS (Row Level Security) politikalarÄ±
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir
CREATE POLICY IF NOT EXISTS "Settings are viewable by everyone"
  ON settings FOR SELECT
  USING (true);

-- Sadece authenticated kullanÄ±cÄ±lar gÃ¼ncelleyebilir
CREATE POLICY IF NOT EXISTS "Settings are editable by authenticated users"
  ON settings FOR UPDATE
  USING (auth.role() = 'authenticated');

