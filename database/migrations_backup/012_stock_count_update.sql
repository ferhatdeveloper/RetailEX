-- Migration: 012_stock_count_update.sql
-- Description: Update WMS Counting Lines to support UUID Product ID

-- 1. Add product_id to wms.counting_lines
ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS product_id UUID;

-- 2. Add notes to wms.counting_lines if missing
ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_counting_lines_slip_id ON wms.counting_lines(slip_id);
CREATE INDEX IF NOT EXISTS idx_counting_lines_product_id ON wms.counting_lines(product_id);
