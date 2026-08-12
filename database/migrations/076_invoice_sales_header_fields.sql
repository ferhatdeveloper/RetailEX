-- Fatura başlık alanları (özel kod, depo, satış elemanı vb.) — tüm dönem sales tabloları
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS header_fields JSONB NOT NULL DEFAULT ''{}''::jsonb',
      r.tablename
    );
  END LOOP;
END $$;
