-- Kasa satırlarına mağaza (store_id) — çok mağazalı filtre / yazım
-- Mevcut dönem tabloları + create_period_tables şablonu (000/060 ile senkron)

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS store_id UUID',
      r.schemaname,
      r.tablename
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (store_id) WHERE store_id IS NOT NULL',
      r.tablename || '_store_id_idx',
      r.schemaname,
      r.tablename
    );
  END LOOP;
END $$;
