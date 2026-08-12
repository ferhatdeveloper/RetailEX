-- ============================================================================
-- 047: Ürün kartı — tartı ürünü bayrağı (teraziye PLU aktarımı için)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_scale_product BOOLEAN NOT NULL DEFAULT false',
      r.tablename
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
