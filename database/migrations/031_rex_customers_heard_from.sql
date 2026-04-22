-- 031: rex_*_customers — müşteri edinim kaynağı (bizi nereden duydunuz)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS heard_from VARCHAR(150)', r.tablename);
  END LOOP;
END $$;

