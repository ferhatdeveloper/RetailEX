-- Kiracı WebSocket / broadcast hub (RetailEX-Sync-Service)
-- public.sync_queue (hibrit PG) ile karışmaz — teslimat kuyruğu: broadcast_delivery_queue

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.broadcast_messages (
  id UUID PRIMARY KEY,
  message_type TEXT NOT NULL,
  action TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  target_stores UUID[],
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_targets INTEGER NOT NULL DEFAULT 0,
  successful INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  store_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_store
  ON public.broadcast_recipients (store_id, status);

CREATE TABLE IF NOT EXISTS public.broadcast_delivery_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcast_messages(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES public.broadcast_recipients(id) ON DELETE SET NULL,
  store_id UUID NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  sequence_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}',
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  error_message TEXT,
  last_error_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_delivery_store_pending
  ON public.broadcast_delivery_queue (store_id, status, priority, sequence_number)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.store_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  pending_messages INTEGER NOT NULL DEFAULT 0,
  app_version TEXT NOT NULL DEFAULT '',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_devices_store
  ON public.store_devices (store_id, status);

COMMENT ON TABLE public.broadcast_messages IS 'Merkez → mağaza WebSocket broadcast kayıtları (api.retailex.app/{kiracı}/sync)';
COMMENT ON TABLE public.broadcast_delivery_queue IS 'WS teslimat kuyruğu — hibrit sync_queue ile aynı değil';

INSERT INTO public.service_health (service_name, status, version, metadata)
VALUES (
  'RetailEX-Sync-Service',
  'OFFLINE',
  '2.0.0',
  '{"description": "Kiracı WebSocket senkron hub", "ws_path": "/{tenant}/ws", "api_path": "/{tenant}/sync"}'::jsonb
)
ON CONFLICT (service_name) DO UPDATE SET
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
