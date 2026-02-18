-- ============================================================================
-- RetailEx - SYNC LOGS TABLE (v3.1)
-- ----------------------------------------------------------------------------
-- Professional infrastructure for tracking data synchronization history
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    sync_type VARCHAR(50) NOT NULL, -- 'delta', 'full', 'manual'
    last_sync_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'success',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_firm_type ON public.sync_logs(firm_nr, sync_type);

-- Seed initial records for existing firms
INSERT INTO public.sync_logs (firm_nr, sync_type, last_sync_date)
SELECT firm_nr, 'delta', NOW() - INTERVAL '1 day'
FROM firms
ON CONFLICT DO NOTHING;
