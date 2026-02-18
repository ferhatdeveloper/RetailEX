-- RetailEX Service Health Monitoring Infrastructure

CREATE TABLE IF NOT EXISTS public.service_health (
    service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT NOT NULL UNIQUE,
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'ERROR', 'MAINTENANCE')),
    version TEXT,
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_service_health_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_service_health_timestamp
    BEFORE UPDATE ON public.service_health
    FOR EACH ROW
    EXECUTE FUNCTION update_service_health_timestamp();

-- Function to update or insert heartbeat
CREATE OR REPLACE FUNCTION upsert_service_health(
    p_name TEXT,
    p_status TEXT,
    p_version TEXT,
    p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.service_health (service_name, status, version, metadata, last_heartbeat)
    VALUES (p_name, p_status, p_version, p_metadata, NOW())
    ON CONFLICT (service_name) DO UPDATE
    SET status = EXCLUDED.status,
        version = EXCLUDED.version,
        metadata = public.service_health.metadata || EXCLUDED.metadata,
        last_heartbeat = NOW();
END;
$$ LANGUAGE plpgsql;

-- Maintenance function to mark stale services as OFFLINE
CREATE OR REPLACE FUNCTION cleanup_stale_services() RETURNS VOID AS $$
BEGIN
    UPDATE public.service_health
    SET status = 'OFFLINE'
    WHERE last_heartbeat < NOW() - INTERVAL '5 minutes'
    AND status != 'OFFLINE';
END;
$$ LANGUAGE plpgsql;

-- Initial records
SELECT upsert_service_health('RetailEX-Sync-Service', 'OFFLINE', '2.0.0', '{"description": "Core synchronization engine"}');
SELECT upsert_service_health('RetailEX-Logo-Connector', 'OFFLINE', '1.0.0', '{"description": "Logo ERP data bridge"}');
