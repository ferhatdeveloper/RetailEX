-- ============================================================================
-- 053: Ürün kartı — SKT / raf ömrü / son kullanma takibi
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS expiry_date DATE',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS expiry_tracking BOOLEAN NOT NULL DEFAULT false',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER',
      r.tablename
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
