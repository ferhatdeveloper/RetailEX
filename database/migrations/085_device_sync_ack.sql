-- Merkez: cihaz senkron oturumu onayı (alım/gönderim sonrası detaylı bildirim)

CREATE TABLE IF NOT EXISTS public.device_sync_ack (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id            TEXT NOT NULL,
  firm_nr              VARCHAR(10) NOT NULL,
  store_id             UUID,
  terminal_name        VARCHAR(100),
  direction            VARCHAR(20) NOT NULL,
  sync_mode            VARCHAR(16) NOT NULL DEFAULT 'incremental',
  status               VARCHAR(20) NOT NULL DEFAULT 'ok',
  record_count         INTEGER NOT NULL DEFAULT 0,
  inserted_count       INTEGER NOT NULL DEFAULT 0,
  updated_count        INTEGER NOT NULL DEFAULT 0,
  skipped_count        INTEGER NOT NULL DEFAULT 0,
  failed_count         INTEGER NOT NULL DEFAULT 0,
  price_change_count   INTEGER NOT NULL DEFAULT 0,
  price_ack_count      INTEGER NOT NULL DEFAULT 0,
  pending_price_count  INTEGER NOT NULL DEFAULT 0,
  products_with_price  INTEGER NOT NULL DEFAULT 0,
  table_breakdown      JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_changes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  watermark_from       TIMESTAMPTZ,
  watermark_to         TIMESTAMPTZ,
  app_version          VARCHAR(50),
  message              TEXT,
  detail               JSONB NOT NULL DEFAULT '{}'::jsonb,
  local_log_id         UUID,
  ack_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_sync_ack_device_ack
  ON public.device_sync_ack (device_id, ack_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_sync_ack_firm_direction_ack
  ON public.device_sync_ack (firm_nr, direction, ack_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_sync_ack_store_ack
  ON public.device_sync_ack (store_id, ack_at DESC)
  WHERE store_id IS NOT NULL;

COMMENT ON TABLE public.device_sync_ack IS 'Cihaz senkron oturumu — merkez paneli: son alım, fiyatlı ürün, bekleyen fiyat';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT ON public.device_sync_ack TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
