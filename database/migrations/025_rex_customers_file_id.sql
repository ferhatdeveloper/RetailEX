-- ============================================================================
-- 025: rex_*_customers — dosya / dosya no (file_id)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS file_id VARCHAR(120)', r.tablename);
  END LOOP;
END $$;
