-- ============================================================================
-- 022: Beauty — Randevu öncesi arama ve aktivite zaman damgaları (CRM hatırlatma)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS confirmation_call_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS pre_visit_activity_at TIMESTAMPTZ', r.tablename);
  END LOOP;
END $$;
