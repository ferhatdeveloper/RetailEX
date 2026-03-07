-- WMS Picking Engine Tables
CREATE TABLE IF NOT EXISTS public.wms_pick_waves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wave_no VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, picking, completed, cancelled
    picker_id UUID REFERENCES auth.users(id),
    order_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.wms_pick_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wave_id UUID REFERENCES public.wms_pick_waves(id) ON DELETE CASCADE,
    product_id UUID,
    quantity NUMERIC(18, 5) NOT NULL,
    picked_quantity NUMERIC(18, 5) DEFAULT 0,
    location_code VARCHAR(50), -- e.g., 'A-01-02'
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Attach Audit Trail to WMS Picking tables
SELECT public.ATTACH_AUDIT_LOG('wms_pick_waves');
SELECT public.ATTACH_AUDIT_LOG('wms_pick_tasks');

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_wms_pick_tasks_wave ON public.wms_pick_tasks(wave_id);
CREATE INDEX IF NOT EXISTS idx_wms_pick_tasks_location ON public.wms_pick_tasks(location_code);
