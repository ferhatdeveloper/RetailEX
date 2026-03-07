-- ============================================================================
-- RetailEx - RESTAURANT KROKI LAYOUT PERSISTENCE (v3.2)
-- ----------------------------------------------------------------------------
-- Stores floor plan / kroki layout configurations per store
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rest_kroki_layouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    floor_name VARCHAR(100) NOT NULL DEFAULT 'Tümü',
    layout_data JSONB NOT NULL DEFAULT '{}',   -- { tableId: { x, y, w, h, shape } }
    hidden_tables TEXT[] DEFAULT '{}',          -- Array of hidden table IDs
    updated_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, floor_name)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_rest_kroki_store_floor 
ON public.rest_kroki_layouts(store_id, floor_name);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_kroki_layout_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kroki_layout_updated ON public.rest_kroki_layouts;
CREATE TRIGGER trg_kroki_layout_updated
    BEFORE UPDATE ON public.rest_kroki_layouts
    FOR EACH ROW
    EXECUTE FUNCTION update_kroki_layout_timestamp();
