-- ============================================================================
-- 113: Logo REST giden senkron — kasa/banka + malzeme fişi kuyruk kolonları
-- rex_*_cash_registers, rex_*_*_stock_movements → logo_sync_status
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_cash_registers$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20)',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_sync_error TEXT',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_sync_date TIMESTAMPTZ',
      r.tablename
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (logo_sync_status) WHERE logo_sync_status = ''pending''',
      r.tablename || '_logo_sync_pending_idx',
      r.tablename
    );
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_[0-9]+_stock_movements$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20)',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_sync_error TEXT',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS logo_sync_date TIMESTAMPTZ',
      r.tablename
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (logo_sync_status) WHERE logo_sync_status = ''pending''',
      r.tablename || '_logo_sync_pending_idx',
      r.tablename
    );
  END LOOP;
END $$;
