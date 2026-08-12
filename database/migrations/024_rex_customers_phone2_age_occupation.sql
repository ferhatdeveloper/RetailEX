-- ============================================================================
-- 024: rex_*_customers — ikinci telefon, yaş, meslek (CRM alanları)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS phone2 VARCHAR(50)', r.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS age INTEGER', r.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS occupation VARCHAR(150)', r.tablename);
  END LOOP;
END $$;
