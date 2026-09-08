-- ============================================================================
-- 148: rex_*_customers — doğum tarihi (birth_date); formda yaş yerine kullanılır
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birth_date DATE', r.tablename);
  END LOOP;
END $$;
