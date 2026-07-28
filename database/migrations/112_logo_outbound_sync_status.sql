-- ============================================================================
-- 112: Logo REST giden senkron — ürün / müşteri / tedarikçi kuyruk kolonları
-- PostgREST (RetailEX PG) → Logo Tiger REST (items / Arps / salesInvoices)
-- Mevcut kayıtlar kuyruğa alınmaz (NULL); yerel ekleme/güncelleme 'pending' yazar.
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_products$'
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
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_customers$'
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
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_suppliers$'
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
