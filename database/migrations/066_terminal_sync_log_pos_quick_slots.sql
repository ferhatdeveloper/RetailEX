-- MPOS kasa gönder/al geçmişi + PLU/kısayol tuş tanımları (JRetail Basic)

CREATE TABLE IF NOT EXISTS public.terminal_sync_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr           VARCHAR(10) NOT NULL,
  store_id          UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  terminal_name     VARCHAR(100),
  terminal_device_id TEXT,
  direction         VARCHAR(10) NOT NULL CHECK (direction IN ('send', 'receive')),
  file_type         VARCHAR(64) NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed', 'partial')),
  record_count      INTEGER NOT NULL DEFAULT 0,
  business_date     DATE,
  message           TEXT,
  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_sync_log_firm_created
  ON public.terminal_sync_log (firm_nr, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_sync_log_store_terminal
  ON public.terminal_sync_log (store_id, terminal_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pos_quick_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr     VARCHAR(10) NOT NULL,
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  page_index  SMALLINT NOT NULL DEFAULT 0 CHECK (page_index >= 0 AND page_index < 4),
  slot_index  SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index < 12),
  product_id  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, page_index, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_pos_quick_slots_store
  ON public.pos_quick_slots (store_id, page_index, slot_index);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT ON public.terminal_sync_log TO anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_quick_slots TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
