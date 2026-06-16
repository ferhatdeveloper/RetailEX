-- Entegrasyonlar → sistem sağlığı: service_health yardımcıları + sync_logs

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(10) NOT NULL,
  store_code      TEXT,
  sync_type       TEXT NOT NULL,
  last_sync_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_last_sync
  ON public.sync_logs (last_sync_date DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_firm_store
  ON public.sync_logs (firm_nr, store_code, last_sync_date DESC);

COMMENT ON TABLE public.sync_logs IS 'Hibrit senkron / Logo köprüsü olay günlüğü (IntegrationsModule)';

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
    p_service_name,
    NOW(),
    p_status,
    p_version,
    COALESCE(p_metadata, '{}'::jsonb),
    NOW()
  )
  ON CONFLICT (service_name) DO UPDATE SET
    last_heartbeat = EXCLUDED.last_heartbeat,
    status = EXCLUDED.status,
    version = COALESCE(EXCLUDED.version, public.service_health.version),
    metadata = COALESCE(EXCLUDED.metadata, public.service_health.metadata),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_services(
  p_stale_after INTERVAL DEFAULT INTERVAL '5 minutes'
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.service_health
  SET status = 'OFFLINE',
      updated_at = NOW()
  WHERE status = 'ONLINE'
    AND last_heartbeat < NOW() - p_stale_after;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_services IS 'Son heartbeat eski ONLINE servisleri OFFLINE yapar';
