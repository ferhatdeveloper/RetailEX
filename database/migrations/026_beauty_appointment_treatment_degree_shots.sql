-- ============================================================================
-- 026: Beauty randevu — lazer/tedavi fişi ile uyumlu derece ve atış (POS’ta da kullanılır)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS treatment_degree VARCHAR(80)', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS treatment_shots VARCHAR(80)', r.tablename);
  END LOOP;
END $$;
