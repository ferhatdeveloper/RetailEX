-- ============================================================================
-- 027: Beauty randevu — klinik şema / paneller (diş FDI, fizik, KD, diyet) JSONB
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS clinical_data JSONB DEFAULT ''{}''::jsonb',
      r.tablename
    );
  END LOOP;
END $$;
