-- ============================================================================
-- 104: Ürün kartı — terazi PLU kodu (rex_*_products.plu_code)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS plu_code VARCHAR(20)',
      r.tablename
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
