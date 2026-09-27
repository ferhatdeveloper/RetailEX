-- ============================================================================
-- 170: Doğum günü WhatsApp — yapılandırılabilir hediye + tam N gün önce
-- ============================================================================

DO $$
DECLARE
  f RECORD;
  v_prefix TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    v_prefix := lower('rex_' || f.firm_nr);
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_gift_text TEXT',
      v_prefix || '_messaging_settings'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS birthday_upcoming_exact BOOLEAN DEFAULT false',
      v_prefix || '_messaging_settings'
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
NOTIFY pgrst, 'reload schema';
