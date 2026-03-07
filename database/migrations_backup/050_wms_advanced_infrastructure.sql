-- ============================================================================
-- RetailEx - WMS ADVANCED INFRASTRUCTURE MIGRATION (v3.1)
-- ----------------------------------------------------------------------------
-- Tables for Yard Management, Labor Productivity, and Slotting
-- ============================================================================

-- Yard Management (Park Alanları)
CREATE TABLE IF NOT EXISTS public.wms_yard_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'A1', 'A2', 'GATE-01'
    type VARCHAR(50) DEFAULT 'parking', -- parking, loading_dock, waiting_area
    status VARCHAR(20) DEFAULT 'available', -- available, occupied, maintenance
    vehicle_plate VARCHAR(20),
    driver_name VARCHAR(255),
    entry_time TIMESTAMPTZ,
    warehouse_id UUID, -- Optional: Link to specific warehouse if needed
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Labor Management (İşgücü Verimliliği)
CREATE TABLE IF NOT EXISTS public.wms_labor_productivity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    task_type VARCHAR(50), -- picking, receiving, counting, loading
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    items_processed NUMERIC(18, 5) DEFAULT 0,
    efficiency_rate NUMERIC(5, 2), -- Percentage
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Slotting Optimization (Raf Yerleşim Önerileri)
CREATE TABLE IF NOT EXISTS public.wms_slotting_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID,
    current_location VARCHAR(50),
    recommended_location VARCHAR(50),
    reason VARCHAR(255), -- e.g., 'High velocity - move to front'
    class VARCHAR(1), -- A, B, C
    is_applied BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
SELECT public.ATTACH_AUDIT_LOG('wms_yard_locations');
SELECT public.ATTACH_AUDIT_LOG('wms_labor_productivity');
SELECT public.ATTACH_AUDIT_LOG('wms_slotting_recommendations');

-- Initial Data for Yard
INSERT INTO public.wms_yard_locations (code, type, status) 
VALUES ('A1', 'parking', 'available'),
       ('A2', 'parking', 'available'),
       ('A3', 'parking', 'occupied')
ON CONFLICT (code) DO NOTHING;
