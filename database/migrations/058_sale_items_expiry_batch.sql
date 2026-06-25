-- 058: rex_*_*_sale_items — alış satırı SKT / parti bilgisi
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
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS expiry_date DATE', r.schemaname, r.tablename);
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS batch_no VARCHAR(120)', r.schemaname, r.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (expiry_date) WHERE expiry_date IS NOT NULL', r.tablename || '_expiry_date_idx', r.schemaname, r.tablename);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
