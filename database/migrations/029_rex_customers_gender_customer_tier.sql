-- ============================================================================
-- 029: rex_*_customers — cinsiyet, müşteri tipi (normal / VIP)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS gender VARCHAR(20)', r.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS customer_tier VARCHAR(20) DEFAULT ''normal''', r.tablename);
  END LOOP;
END $$;
