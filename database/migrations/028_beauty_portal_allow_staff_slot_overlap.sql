-- ============================================================================
-- 028: Beauty portal — Aynı personele aynı saatte birden fazla randevu / işlem
--      (iç kullanım; AppointmentPOS slot kontrolü)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_portal_settings$'
  LOOP
    EXECUTE format('ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS allow_staff_slot_overlap BOOLEAN DEFAULT false', r.tablename);
  END LOOP;
END $$;
