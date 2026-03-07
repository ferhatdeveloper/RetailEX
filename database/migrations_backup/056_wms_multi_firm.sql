-- ============================================================================
-- RetailEx - WMS MULTI-FIRM ISOLATION (v1.0)
-- ----------------------------------------------------------------------------
-- Adds firm_nr column to all wms.* tables that were missing tenant isolation.
-- Without firm_nr, product JOINs (rex_{firm}_products) would silently return
-- wrong-firm data when multiple firms share the same database.
--
-- Tables updated:
--   wms.counting_lines           → was orphan (slip has firm_nr, lines didn't)
--   wms.slotting_recommendations → no tenant isolation
--   wms.pick_waves               → no tenant isolation
--   wms.yard_locations           → no tenant isolation
--   wms.labor_productivity       → no tenant isolation
--   wms.dock_doors               → no tenant isolation
--   wms.task_queue               → no tenant isolation
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. wms.counting_lines  — derive from parent counting_slip
-- ---------------------------------------------------------------------------
ALTER TABLE wms.counting_lines
    ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);

-- Backfill from parent slip
UPDATE wms.counting_lines cl
SET    firm_nr = cs.firm_nr
FROM   wms.counting_slips cs
WHERE  cl.slip_id = cs.id
AND    cl.firm_nr IS NULL;

CREATE INDEX IF NOT EXISTS idx_wms_counting_lines_firm_nr
    ON wms.counting_lines(firm_nr);

-- ---------------------------------------------------------------------------
-- 2. wms.slotting_recommendations
-- ---------------------------------------------------------------------------
ALTER TABLE wms.slotting_recommendations
    ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);

-- Also store product_name to avoid cross-firm JOIN for display
ALTER TABLE wms.slotting_recommendations
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_wms_slotting_firm_applied
    ON wms.slotting_recommendations(firm_nr, is_applied);

-- ---------------------------------------------------------------------------
-- 3. wms.pick_waves
-- ---------------------------------------------------------------------------
ALTER TABLE wms.pick_waves
    ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);

-- Backfill from warehouse (store)
UPDATE wms.pick_waves pw
SET    firm_nr = s.firm_nr
FROM   public.stores s
WHERE  pw.warehouse_id = s.id
AND    pw.firm_nr IS NULL;

CREATE INDEX IF NOT EXISTS idx_wms_pick_waves_firm_status
    ON wms.pick_waves(firm_nr, status, priority);

-- ---------------------------------------------------------------------------
-- 4. wms.yard_locations
-- ---------------------------------------------------------------------------
ALTER TABLE wms.yard_locations
    ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);

UPDATE wms.yard_locations yl
SET    firm_nr = s.firm_nr
FROM   public.stores s
WHERE  yl.warehouse_id = s.id
AND    yl.firm_nr IS NULL;

CREATE INDEX IF NOT EXISTS idx_wms_yard_firm_status
    ON wms.yard_locations(firm_nr, status);

-- ---------------------------------------------------------------------------
-- 5. wms.labor_productivity
-- ---------------------------------------------------------------------------
ALTER TABLE wms.labor_productivity
    ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_wms_labor_firm_date
    ON wms.labor_productivity(firm_nr, start_time);

-- ---------------------------------------------------------------------------
-- 6. wms.dock_doors
-- ---------------------------------------------------------------------------
ALTER TABLE wms.dock_doors
    ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);

UPDATE wms.dock_doors dd
SET    firm_nr = s.firm_nr
FROM   public.stores s
WHERE  dd.warehouse_id = s.id
AND    dd.firm_nr IS NULL;

CREATE INDEX IF NOT EXISTS idx_wms_dock_firm_status
    ON wms.dock_doors(firm_nr, status);

-- ---------------------------------------------------------------------------
-- 7. wms.task_queue
-- ---------------------------------------------------------------------------
ALTER TABLE wms.task_queue
    ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10);

UPDATE wms.task_queue tq
SET    firm_nr = s.firm_nr
FROM   public.stores s
WHERE  tq.warehouse_id = s.id
AND    tq.firm_nr IS NULL;

CREATE INDEX IF NOT EXISTS idx_wms_task_queue_firm_status
    ON wms.task_queue(firm_nr, status, priority);
