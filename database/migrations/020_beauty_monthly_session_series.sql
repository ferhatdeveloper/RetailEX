-- ============================================================================
-- 020: Beauty — Aylık tekrarlayan çok seanslı paket serileri (aynı gün / ay)
--       randevularını gruplamak için session_series_id
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS session_series_id UUID', r.tablename);
  END LOOP;
END $$;
