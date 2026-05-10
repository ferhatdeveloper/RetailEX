-- ============================================================================
-- 035: Ürün kartı — güzellik sarf sonrası X gün hatırlatma (tamamlanan randevu +
--      beauty_consumable_usage_log üzerinden; Hizmet & tarih + giriş toast)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS follow_up_reminder_days INTEGER',
      r.tablename
    );
  END LOOP;
END $$;
