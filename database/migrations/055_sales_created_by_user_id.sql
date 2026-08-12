-- ============================================================================
-- 055: Satış / iade faturaları — iade yapan kullanıcı (created_by_user_id)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL',
      r.tablename
    );
  END LOOP;
END $$;
