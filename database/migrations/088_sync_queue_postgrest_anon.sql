-- Merkez PostgREST: hibrit sync_queue API (GET/PATCH) — kasa önizlemesi ve receive
-- Merkez DB'de 048+049 uygulandıktan sonra anon erişimi ve şema yenileme.

DO $$
BEGIN
  IF to_regclass('public.sync_queue') IS NULL THEN
    RAISE NOTICE '088: public.sync_queue yok — önce 048/049/079 migration çalıştırın.';
    RETURN;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.sync_queue TO anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_sync_queue_item'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.apply_sync_queue_item(TEXT, TEXT, UUID, JSONB) TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
