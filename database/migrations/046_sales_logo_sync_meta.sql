-- ============================================================================
-- 046: Satış faturaları — Logo REST aktarım durumu (hata + tarih)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_sync_error TEXT',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_sync_date TIMESTAMPTZ',
      r.tablename
    );
  END LOOP;
END $$;
