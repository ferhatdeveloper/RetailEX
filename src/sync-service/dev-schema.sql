-- Sync Service geliştirme / sqlx prepare şeması (broadcast motoru)
-- Not: public.sync_queue (hibrit PG) ile karıştırmayın — WS teslimat: broadcast_delivery_queue

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS broadcast_messages (
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

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id UUID PRIMARY KEY,
  broadcast_id UUID NOT NULL REFERENCES broadcast_messages(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS broadcast_delivery_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id UUID NOT NULL,
  recipient_id UUID,
  store_id UUID NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  sequence_number BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
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

CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr VARCHAR(10) NOT NULL,
  code VARCHAR(50) UNIQUE,
  name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id UUID,
  nr INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS store_devices (
  id UUID PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS firms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.service_health (
  service_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name TEXT NOT NULL UNIQUE,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL,
  version      TEXT,
  metadata     JSONB DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_nr         VARCHAR(10) NOT NULL,
  store_code      TEXT,
  sync_type       TEXT NOT NULL,
  last_sync_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.upsert_service_health(
  p_service_name TEXT,
  p_status TEXT,
  p_version TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.service_health (
    service_name, last_heartbeat, status, version, metadata, updated_at
  )
  VALUES (
    p_service_name, NOW(), p_status, p_version,
    COALESCE(p_metadata, '{}'::jsonb), NOW()
  )
  ON CONFLICT (service_name) DO UPDATE SET
    last_heartbeat = EXCLUDED.last_heartbeat,
    status = EXCLUDED.status,
    version = COALESCE(EXCLUDED.version, public.service_health.version),
    metadata = COALESCE(EXCLUDED.metadata, public.service_health.metadata),
    updated_at = NOW();
END;
$$;

-- stores / periods zaten master şemada olmalı
