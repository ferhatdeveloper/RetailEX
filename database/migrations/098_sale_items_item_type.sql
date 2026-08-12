-- 098: rex_*_*_sale_items — satır türü (Malzeme / Hizmet / Promosyon / İndirim)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_sale_items$'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT ''Malzeme''',
      r.schemaname,
      r.tablename
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
