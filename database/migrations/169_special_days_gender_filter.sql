-- ============================================================================
-- 169: Özel gün WhatsApp kampanyası — cinsiyet filtresi (ör. Kadınlar Günü → yalnızca female)
-- ============================================================================

DO $$
DECLARE
  f RECORD;
  v_prefix TEXT;
BEGIN
  FOR f IN SELECT firm_nr FROM firms WHERE COALESCE(is_active, true) LOOP
    v_prefix := lower('rex_' || f.firm_nr);
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS gender_filter VARCHAR(20)',
      v_prefix || '_special_days'
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
NOTIFY pgrst, 'reload schema';
