-- ============================================================================
-- 021: Beauty hizmet kartı — varsayılan seans sayısı (çok seanslı tedaviler)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_services$'
  LOOP
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS default_sessions INTEGER NOT NULL DEFAULT 1',
      r.tablename
    );
    EXECUTE format(
      'UPDATE beauty.%I SET default_sessions = 1 WHERE default_sessions IS NULL',
      r.tablename
    );
  END LOOP;
END $$;
