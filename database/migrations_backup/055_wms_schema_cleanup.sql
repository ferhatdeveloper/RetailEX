-- ============================================================================
-- RetailEx - WMS SCHEMA CLEANUP (v1.0)
-- ----------------------------------------------------------------------------
-- Consolidates all WMS tables into the `wms` schema.
-- Previously, advanced WMS tables (yard, labor, slotting) were in `public`.
-- This migration moves them to the proper `wms` schema.
--
-- Schema layout:
--   wms.bins                     → Raf/Konum tanımları (var)
--   wms.counting_slips           → Sayım fişleri (var)
--   wms.counting_lines           → Sayım fişi kalemleri (var)
--   wms.transfers                → Transfer emirleri (var)
--   wms.pick_waves               → Toplama dalgaları (yeni / taşındı)
--   wms.yard_locations           → Avlu / Park yönetimi (taşındı)
--   wms.labor_productivity       → İşgücü verimliliği (taşındı)
--   wms.slotting_recommendations → Raf yerleşim önerileri (taşındı)
--   wms.dock_doors               → Rampa kapıları (yeni)
--   wms.task_queue               → İş kuyruğu (yeni)
-- ============================================================================

-- Ensure wms schema exists
CREATE SCHEMA IF NOT EXISTS wms;

-- ---------------------------------------------------------------------------
-- 1. wms.yard_locations  (Avlu / Park Alanı Yönetimi)
--    Moved from public.wms_yard_locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wms.yard_locations (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    code          VARCHAR(50) UNIQUE NOT NULL,       -- 'A1', 'GATE-01', 'LOADING-3'
    type          VARCHAR(50) DEFAULT 'parking',     -- parking | loading_dock | waiting_area | gate
    status        VARCHAR(20) DEFAULT 'available',   -- available | occupied | maintenance | closed
    vehicle_plate VARCHAR(20),
    driver_name   VARCHAR(255),
    entry_time    TIMESTAMPTZ,
    exit_time     TIMESTAMPTZ,
    warehouse_id  UUID        REFERENCES public.stores(id) ON DELETE SET NULL,
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wms_yard_locations_status
    ON wms.yard_locations(status);

-- Migrate from public.wms_yard_locations if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'wms_yard_locations'
    ) THEN
        INSERT INTO wms.yard_locations
            (id, code, type, status, vehicle_plate, driver_name, entry_time, warehouse_id, created_at, updated_at)
        SELECT
            id, code, type, status, vehicle_plate, driver_name, entry_time, warehouse_id, created_at, updated_at
        FROM public.wms_yard_locations
        ON CONFLICT (id) DO NOTHING;

        RAISE NOTICE 'Migrated % rows from public.wms_yard_locations to wms.yard_locations',
            (SELECT count(*) FROM public.wms_yard_locations);
    END IF;
END $$;

-- Backward-compat view
CREATE OR REPLACE VIEW public.wms_yard_locations_v AS
    SELECT * FROM wms.yard_locations;

-- ---------------------------------------------------------------------------
-- 2. wms.labor_productivity  (İşgücü Verimliliği)
--    Moved from public.wms_labor_productivity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wms.labor_productivity (
    id               UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID       REFERENCES auth.users(id) ON DELETE SET NULL,
    username         VARCHAR(255),
    task_type        VARCHAR(50),                    -- picking | receiving | counting | loading | putaway
    reference_id     UUID,                           -- FK to relevant slip/wave
    start_time       TIMESTAMPTZ NOT NULL,
    end_time         TIMESTAMPTZ,
    duration_min     NUMERIC(10,2)
        GENERATED ALWAYS AS (
            CASE WHEN end_time IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60
                 ELSE NULL
            END
        ) STORED,
    items_processed  NUMERIC(18,5) DEFAULT 0,
    lines_processed  INTEGER       DEFAULT 0,
    efficiency_rate  NUMERIC(5,2),                  -- %
    warehouse_id     UUID,
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wms_labor_user_date
    ON wms.labor_productivity(user_id, start_time);

CREATE INDEX IF NOT EXISTS idx_wms_labor_task_type
    ON wms.labor_productivity(task_type, start_time);

-- Migrate from public.wms_labor_productivity
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'wms_labor_productivity'
    ) THEN
        INSERT INTO wms.labor_productivity
            (id, user_id, task_type, start_time, end_time, items_processed, efficiency_rate, created_at)
        SELECT
            id, user_id, task_type, start_time, end_time, items_processed, efficiency_rate, created_at
        FROM public.wms_labor_productivity
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. wms.slotting_recommendations  (Raf Yerleşim Önerileri)
--    Moved from public.wms_slotting_recommendations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wms.slotting_recommendations (
    id                   UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id           UUID,                       -- → firm products table
    product_code         VARCHAR(100),
    current_location     VARCHAR(50),
    recommended_location VARCHAR(50),
    reason               VARCHAR(255),               -- 'High velocity - move to front'
    velocity_class       VARCHAR(1),                 -- A | B | C
    daily_picks          NUMERIC(10,2) DEFAULT 0,
    distance_saved_m     NUMERIC(8,2),
    is_applied           BOOLEAN    DEFAULT false,
    applied_at           TIMESTAMPTZ,
    applied_by           VARCHAR(255),
    created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wms_slotting_velocity
    ON wms.slotting_recommendations(velocity_class, is_applied);

-- Migrate from public.wms_slotting_recommendations
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'wms_slotting_recommendations'
    ) THEN
        INSERT INTO wms.slotting_recommendations
            (id, product_id, current_location, recommended_location, reason, velocity_class, is_applied, created_at)
        SELECT
            id, product_id, current_location, recommended_location, reason, class, is_applied, created_at
        FROM public.wms_slotting_recommendations
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. wms.pick_waves  (Toplama Dalgaları — pick wave management)
--    Some previously in public.wms_pick_waves
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wms.pick_waves (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    wave_no      VARCHAR(50) UNIQUE NOT NULL,        -- 'WAVE-2026-0001'
    warehouse_id UUID        REFERENCES public.stores(id) ON DELETE SET NULL,
    status       VARCHAR(20) DEFAULT 'draft',        -- draft | released | picking | completed | cancelled
    priority     INTEGER     DEFAULT 5,              -- 1 (highest) - 10 (lowest)
    wave_type    VARCHAR(30) DEFAULT 'standard',     -- standard | rush | batch | zone
    total_lines  INTEGER     DEFAULT 0,
    picked_lines INTEGER     DEFAULT 0,
    total_qty    NUMERIC(18,5) DEFAULT 0,
    picked_qty   NUMERIC(18,5) DEFAULT 0,
    assigned_to  VARCHAR(255),
    released_at  TIMESTAMPTZ,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    due_date     TIMESTAMPTZ,
    notes        TEXT,
    created_by   VARCHAR(255),
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wms_pick_waves_status
    ON wms.pick_waves(status, priority);

-- Migrate from public.wms_pick_waves
-- NOTE: public.wms_pick_waves (039) has only: id, wave_no, status, picker_id, order_count, created_at, updated_at
--       New columns are populated with defaults.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'wms_pick_waves'
    ) THEN
        INSERT INTO wms.pick_waves
            (id, wave_no, warehouse_id, status, priority, total_lines, picked_lines,
             total_qty, picked_qty, assigned_to, released_at, started_at, completed_at,
             due_date, notes, created_by, created_at, updated_at)
        SELECT
            id, wave_no,
            NULL,                       -- warehouse_id (not in 039 schema)
            status,
            5,                          -- priority default
            COALESCE(order_count, 0),   -- total_lines ≈ order_count
            0,                          -- picked_lines
            0,                          -- total_qty
            0,                          -- picked_qty
            NULL,                       -- assigned_to
            NULL,                       -- released_at
            NULL,                       -- started_at
            NULL,                       -- completed_at
            NULL,                       -- due_date
            NULL,                       -- notes
            NULL,                       -- created_by
            created_at,
            updated_at
        FROM public.wms_pick_waves
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. wms.dock_doors  (Rampa / Bağlantı Kapıları — yeni)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wms.dock_doors (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    code         VARCHAR(20) UNIQUE NOT NULL,        -- 'DOCK-01', 'RAMP-A1'
    name         VARCHAR(100) NOT NULL,
    type         VARCHAR(20) DEFAULT 'inbound',      -- inbound | outbound | cross | any
    warehouse_id UUID        REFERENCES public.stores(id) ON DELETE SET NULL,
    status       VARCHAR(20) DEFAULT 'available',    -- available | occupied | maintenance
    vehicle_plate VARCHAR(20),
    carrier_name VARCHAR(100),
    assigned_at  TIMESTAMPTZ,
    is_active    BOOLEAN     DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wms_dock_doors_status
    ON wms.dock_doors(status) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 6. wms.task_queue  (İş Kuyruğu — depo görev dağıtımı)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wms.task_queue (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_type    VARCHAR(30) NOT NULL,               -- picking | putaway | counting | receiving | loading
    reference_id UUID,                               -- FK to wave/slip/etc.
    reference_no VARCHAR(50),
    priority     INTEGER     DEFAULT 5,
    status       VARCHAR(20) DEFAULT 'pending',      -- pending | assigned | in_progress | completed | cancelled
    assigned_to  VARCHAR(255),
    assigned_at  TIMESTAMPTZ,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    warehouse_id UUID        REFERENCES public.stores(id) ON DELETE SET NULL,
    bin_location VARCHAR(50),
    product_code VARCHAR(100),
    quantity     NUMERIC(18,5) DEFAULT 0,
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wms_task_queue_status
    ON wms.task_queue(status, priority, assigned_to);

CREATE INDEX IF NOT EXISTS idx_wms_task_queue_type
    ON wms.task_queue(task_type, status);

-- ---------------------------------------------------------------------------
-- 7. wms.update_timestamp()  (trigger helper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wms.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wms_yard_updated ON wms.yard_locations;
CREATE TRIGGER trg_wms_yard_updated
    BEFORE UPDATE ON wms.yard_locations
    FOR EACH ROW EXECUTE FUNCTION wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_dock_updated ON wms.dock_doors;
CREATE TRIGGER trg_wms_dock_updated
    BEFORE UPDATE ON wms.dock_doors
    FOR EACH ROW EXECUTE FUNCTION wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_pick_waves_updated ON wms.pick_waves;
CREATE TRIGGER trg_wms_pick_waves_updated
    BEFORE UPDATE ON wms.pick_waves
    FOR EACH ROW EXECUTE FUNCTION wms.update_timestamp();

DROP TRIGGER IF EXISTS trg_wms_task_queue_updated ON wms.task_queue;
CREATE TRIGGER trg_wms_task_queue_updated
    BEFORE UPDATE ON wms.task_queue
    FOR EACH ROW EXECUTE FUNCTION wms.update_timestamp();
