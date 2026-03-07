-- ============================================================================
-- RetailEx - WMS STOCK COUNT ENHANCEMENT (v1.0)
-- ----------------------------------------------------------------------------
-- Enhances wms.counting_slips and wms.counting_lines tables with
-- additional fields needed for full inventory counting workflow.
-- ============================================================================

-- 1. Enhance counting_slips
ALTER TABLE wms.counting_slips
    ADD COLUMN IF NOT EXISTS count_type VARCHAR(20) DEFAULT 'full',
    ADD COLUMN IF NOT EXISTS location_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update status comment: draft | active | counting | reconciliation | completed | cancelled
COMMENT ON COLUMN wms.counting_slips.status IS 'draft | active | counting | reconciliation | completed | cancelled';
COMMENT ON COLUMN wms.counting_slips.count_type IS 'full | cycle | location';

-- 2. Enhance counting_lines
ALTER TABLE wms.counting_lines
    ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS location_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS counted_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS counted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_counting_slips_firm_nr ON wms.counting_slips(firm_nr);
CREATE INDEX IF NOT EXISTS idx_counting_slips_status ON wms.counting_slips(status);
CREATE INDEX IF NOT EXISTS idx_counting_slips_store_id ON wms.counting_slips(store_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_product_id ON wms.counting_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_barcode ON wms.counting_lines(barcode);

-- 4. Auto-update updated_at trigger for counting_slips
CREATE OR REPLACE FUNCTION wms.update_counting_slips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_counting_slips_updated_at ON wms.counting_slips;
CREATE TRIGGER trg_counting_slips_updated_at
    BEFORE UPDATE ON wms.counting_slips
    FOR EACH ROW EXECUTE FUNCTION wms.update_counting_slips_updated_at();

DROP TRIGGER IF EXISTS trg_counting_lines_updated_at ON wms.counting_lines;
CREATE TRIGGER trg_counting_lines_updated_at
    BEFORE UPDATE ON wms.counting_lines
    FOR EACH ROW EXECUTE FUNCTION wms.update_counting_slips_updated_at();
