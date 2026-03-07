-- ============================================================================
-- RetailEx - BEAUTY SCHEMA FIX (Migration 058)
-- ----------------------------------------------------------------------------
-- Problem Summary:
--   1. beauty_appointments (002): missing updated_at → updateAppointmentStatus()
--      crashes with "column updated_at does not exist"
--   2. beauty_device_usage, beauty_package_sales, beauty_sessions: only created
--      by INIT_BEAUTY_PERIOD_TABLES (054) — not by CREATE_PERIOD_TABLES (002)
--      → recordDeviceUsage() / purchasePackage() crash with table not found
--   3. beauty_devices (firm): only in INIT_BEAUTY_FIRM_TABLES (054) — not
--      in CREATE_FIRM_TABLES (002) → getDevices() crashes
--   4. beauty_packages (firm, 002): missing is_active column →
--      getPackages() "column is_active does not exist"
--   5. INIT_BEAUTY_PERIOD_TABLES (054) uses wrong column names:
--      appt_date / appt_time / customer_id / duration_min vs what
--      beautyService.ts expects (appointment_date / appointment_time / client_id / duration)
-- ----------------------------------------------------------------------------
-- Fix Strategy:
--   • ALTER existing *_beauty_appointments  → add missing columns
--   • ALTER existing *_beauty_specialists   → add missing columns
--   • ALTER existing *_beauty_services      → add missing columns (keep category!)
--   • ALTER existing *_beauty_packages(firm)→ add is_active + new definition cols
--   • CREATE *_beauty_devices where missing  (firm table)
--   • CREATE *_beauty_device_usage,
--           *_beauty_sessions,
--           *_beauty_package_sales where missing (period tables)
--   • Replace INIT_BEAUTY_PERIOD_TABLES with old-name-compatible + ALTER-aware version
--   • Replace INIT_BEAUTY_FIRM_TABLES with ALTER-aware + backwards-compatible version
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix existing *_beauty_appointments (period tables)
--    Critical: add updated_at so updateAppointmentStatus() doesn't crash
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_beauty_appointments'
    LOOP
        BEGIN
            -- CRITICAL: service does SET updated_at = NOW()
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', tbl);
            -- Extended columns from 054
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS appt_no         VARCHAR(50)',    tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS room_id         UUID',           tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS device_id       UUID',           tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS paid_amount     DECIMAL(15,2) DEFAULT 0', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS package_sale_id UUID',           tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS session_number  INTEGER',        tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cancel_reason   TEXT',           tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ',    tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS started_at      TIMESTAMPTZ',    tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ',    tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_by      VARCHAR(255)',   tbl);
            -- Keep client_id / appointment_date / appointment_time / duration from 002 as canonical names
            -- Also add 054 aliases so both schemas coexist
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS customer_id     UUID', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS duration_min    INTEGER', tbl);
            RAISE NOTICE 'beauty_appointments fixed: %', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not fix beauty_appointments %: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Fix existing *_beauty_specialists (firm card tables)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_beauty_specialists'
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS code            VARCHAR(50)',                 tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS phone           VARCHAR(50)',                 tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS email           VARCHAR(255)',                tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialties     TEXT[]  DEFAULT ''{}''',     tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS category_codes  TEXT[]  DEFAULT ''{}''',     tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 0',     tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS base_salary     DECIMAL(15,2) DEFAULT 0',    tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS color           VARCHAR(50) DEFAULT ''#6366F1''', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', tbl);
            RAISE NOTICE 'beauty_specialists fixed: %', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not fix beauty_specialists %: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Fix existing *_beauty_services (firm card tables)
--    Keep: name, duration, price, category, color, is_active (service orders by category!)
--    Add: new 054 columns
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_beauty_services'
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS code             VARCHAR(50)',       tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS category_code    VARCHAR(50)',       tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS duration_min     INTEGER DEFAULT 30', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cost             DECIMAL(15,2) DEFAULT 0', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS requires_device  BOOLEAN DEFAULT false', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS device_type_code VARCHAR(50)',       tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS description      TEXT',              tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS display_order    INTEGER DEFAULT 0', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', tbl);
            RAISE NOTICE 'beauty_services fixed: %', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not fix beauty_services %: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Fix existing *_beauty_packages (firm card tables)
--    002 schema: client_id, service_id, total_sessions, remaining_sessions, expiry_date
--    Needed: is_active (service does WHERE is_active = true), name, price, validity_days
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_beauty_packages'
    LOOP
        BEGIN
            -- CRITICAL: service does WHERE is_active = true
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT true',          tbl);
            -- New definition columns
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS name          VARCHAR(255)',                  tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price         DECIMAL(15,2) DEFAULT 0',       tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 365',           tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', tbl);
            RAISE NOTICE 'beauty_packages fixed: %', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not fix beauty_packages %: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Create *_beauty_devices where missing (firm tables)
--    002 CREATE_FIRM_TABLES does NOT create this table.
--    Derive firm prefix from existing beauty_specialists tables.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl      TEXT;
    v_prefix TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_beauty_specialists'
    LOOP
        v_prefix := substring(tbl FROM 1 FOR length(tbl) - length('_beauty_specialists'));
        BEGIN
            EXECUTE format('
                CREATE TABLE IF NOT EXISTS %I (
                    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name             VARCHAR(255) NOT NULL,
                    serial_number    VARCHAR(100) UNIQUE,
                    device_type_code VARCHAR(50),
                    brand            VARCHAR(100),
                    model            VARCHAR(100),
                    room_id          UUID,
                    total_shots      BIGINT       DEFAULT 0,
                    max_shots        BIGINT,
                    last_maintenance DATE,
                    next_maintenance DATE,
                    purchase_date    DATE,
                    warranty_date    DATE,
                    status           VARCHAR(20)  DEFAULT ''active'',
                    notes            TEXT,
                    created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
                    updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
                )
            ', v_prefix || '_beauty_devices');
            RAISE NOTICE 'beauty_devices ensured for: %', v_prefix;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not create beauty_devices for %: %', v_prefix, SQLERRM;
        END;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Create missing period tables for all existing beauty_appointments prefixes
--    beauty_device_usage, beauty_package_sales, beauty_sessions
--    None of these exist in 002's CREATE_PERIOD_TABLES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl      TEXT;
    v_prefix TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_beauty_appointments'
    LOOP
        v_prefix := substring(tbl FROM 1 FOR length(tbl) - length('_beauty_appointments'));

        -- 6a. beauty_device_usage
        BEGIN
            EXECUTE format('
                CREATE TABLE IF NOT EXISTS %I (
                    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    device_id     UUID,
                    session_id    UUID,
                    specialist_id UUID,
                    usage_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
                    shots_used    INTEGER      DEFAULT 0,
                    duration_min  INTEGER      DEFAULT 0,
                    fluence       DECIMAL(6,2),
                    head_type     VARCHAR(50),
                    notes         TEXT,
                    created_at    TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
                )
            ', v_prefix || '_beauty_device_usage');
            RAISE NOTICE 'beauty_device_usage ensured for: %', v_prefix;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not create beauty_device_usage for %: %', v_prefix, SQLERRM;
        END;

        -- 6b. beauty_package_sales
        BEGIN
            EXECUTE format('
                CREATE TABLE IF NOT EXISTS %I (
                    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    sale_no            VARCHAR(50) UNIQUE,
                    customer_id        UUID,
                    package_id         UUID,
                    service_id         UUID,
                    total_sessions     INTEGER      NOT NULL DEFAULT 1,
                    used_sessions      INTEGER      DEFAULT 0,
                    remaining_sessions INTEGER      GENERATED ALWAYS AS (total_sessions - used_sessions) STORED,
                    sale_price         DECIMAL(15,2) NOT NULL DEFAULT 0,
                    paid_amount        DECIMAL(15,2) DEFAULT 0,
                    sale_date          DATE         NOT NULL DEFAULT CURRENT_DATE,
                    expiry_date        DATE,
                    status             VARCHAR(20)  DEFAULT ''active'',
                    notes              TEXT,
                    created_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
                    updated_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
                )
            ', v_prefix || '_beauty_package_sales');
            RAISE NOTICE 'beauty_package_sales ensured for: %', v_prefix;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not create beauty_package_sales for %: %', v_prefix, SQLERRM;
        END;

        -- 6c. beauty_sessions
        BEGIN
            EXECUTE format('
                CREATE TABLE IF NOT EXISTS %I (
                    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    appointment_id     UUID,
                    customer_id        UUID,
                    specialist_id      UUID,
                    service_id         UUID,
                    device_id          UUID,
                    session_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
                    duration_min       INTEGER      DEFAULT 0,
                    shots_used         INTEGER      DEFAULT 0,
                    fluence            DECIMAL(6,2),
                    spot_size          VARCHAR(20),
                    skin_type          VARCHAR(20),
                    treated_area       TEXT,
                    before_photo       TEXT,
                    after_photo        TEXT,
                    practitioner_notes TEXT,
                    customer_feedback  TEXT,
                    rating             SMALLINT,
                    created_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
                )
            ', v_prefix || '_beauty_sessions');
            RAISE NOTICE 'beauty_sessions ensured for: %', v_prefix;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not create beauty_sessions for %: %', v_prefix, SQLERRM;
        END;

    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Replace INIT_BEAUTY_PERIOD_TABLES with old-column-name compatible version
--    Uses: client_id, appointment_date, appointment_time, duration  (as beautyService.ts expects)
--    ALSO adds all extended columns from 054 + ALTERs existing tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION INIT_BEAUTY_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix TEXT;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr || '_' || p_period_nr);

    -- -----------------------------------------------------------------------
    -- 7a. beauty_appointments — use OLD column names (beautyService.ts compat)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            appt_no          VARCHAR(50) UNIQUE,
            client_id        UUID,                   -- beautyService uses client_id
            customer_id      UUID,                   -- alias/extended field
            specialist_id    UUID,
            service_id       UUID,
            room_id          UUID,
            device_id        UUID,
            appointment_date DATE         NOT NULL,  -- beautyService uses appointment_date
            appointment_time TIME         NOT NULL,  -- beautyService uses appointment_time
            duration         INTEGER      DEFAULT 30, -- beautyService uses duration
            duration_min     INTEGER      DEFAULT 30, -- 054 alias
            status           VARCHAR(20)  DEFAULT ''scheduled'',
            type             VARCHAR(20)  DEFAULT ''in-person'',
            total_price      DECIMAL(15,2) DEFAULT 0,
            paid_amount      DECIMAL(15,2) DEFAULT 0,
            package_sale_id  UUID,
            is_package_session BOOLEAN    DEFAULT false,
            session_number   INTEGER,
            notes            TEXT,
            cancel_reason    TEXT,
            created_by       VARCHAR(255),
            confirmed_at     TIMESTAMPTZ,
            started_at       TIMESTAMPTZ,
            completed_at     TIMESTAMPTZ,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_beauty_appointments');

    -- ALTER: ensure all columns exist in case table was created by old CREATE_PERIOD_TABLES
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS customer_id     UUID',   v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS duration_min    INTEGER', v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS appt_no         VARCHAR(50)', v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS room_id         UUID',   v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS device_id       UUID',   v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS paid_amount     DECIMAL(15,2) DEFAULT 0', v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS package_sale_id UUID',   v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS session_number  INTEGER', v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cancel_reason   TEXT',   v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS confirmed_at    TIMESTAMPTZ', v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS started_at      TIMESTAMPTZ', v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ', v_prefix || '_beauty_appointments');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_by      VARCHAR(255)', v_prefix || '_beauty_appointments');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (appointment_date, status)',
        'idx_' || v_prefix || '_beauty_appts_date', v_prefix || '_beauty_appointments');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (customer_id)',
        'idx_' || v_prefix || '_beauty_appts_customer', v_prefix || '_beauty_appointments');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (specialist_id)',
        'idx_' || v_prefix || '_beauty_appts_specialist', v_prefix || '_beauty_appointments');

    -- -----------------------------------------------------------------------
    -- 7b. beauty_device_usage
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            device_id     UUID,
            session_id    UUID,
            specialist_id UUID,
            usage_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
            shots_used    INTEGER      DEFAULT 0,
            duration_min  INTEGER      DEFAULT 0,
            fluence       DECIMAL(6,2),
            head_type     VARCHAR(50),
            notes         TEXT,
            created_at    TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_beauty_device_usage');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (device_id, usage_date)',
        'idx_' || v_prefix || '_beauty_device_usage_dev', v_prefix || '_beauty_device_usage');

    -- -----------------------------------------------------------------------
    -- 7c. beauty_package_sales
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            sale_no            VARCHAR(50) UNIQUE,
            customer_id        UUID,
            package_id         UUID,
            service_id         UUID,
            total_sessions     INTEGER      NOT NULL DEFAULT 1,
            used_sessions      INTEGER      DEFAULT 0,
            remaining_sessions INTEGER      GENERATED ALWAYS AS (total_sessions - used_sessions) STORED,
            sale_price         DECIMAL(15,2) NOT NULL DEFAULT 0,
            paid_amount        DECIMAL(15,2) DEFAULT 0,
            sale_date          DATE         NOT NULL DEFAULT CURRENT_DATE,
            expiry_date        DATE,
            status             VARCHAR(20)  DEFAULT ''active'',
            notes              TEXT,
            created_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_beauty_package_sales');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (customer_id, status)',
        'idx_' || v_prefix || '_beauty_pkg_sales_cust', v_prefix || '_beauty_package_sales');

    -- -----------------------------------------------------------------------
    -- 7d. beauty_sessions
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            appointment_id     UUID,
            customer_id        UUID,
            specialist_id      UUID,
            service_id         UUID,
            device_id          UUID,
            session_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
            duration_min       INTEGER      DEFAULT 0,
            shots_used         INTEGER      DEFAULT 0,
            fluence            DECIMAL(6,2),
            spot_size          VARCHAR(20),
            skin_type          VARCHAR(20),
            treated_area       TEXT,
            before_photo       TEXT,
            after_photo        TEXT,
            practitioner_notes TEXT,
            customer_feedback  TEXT,
            rating             SMALLINT,
            created_at         TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_beauty_sessions');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (appointment_id)',
        'idx_' || v_prefix || '_beauty_sessions_appt', v_prefix || '_beauty_sessions');

    RAISE NOTICE 'Beauty period tables fixed/created for %_%', p_firm_nr, p_period_nr;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 8. Replace INIT_BEAUTY_FIRM_TABLES with ALTER-aware + backwards-compatible version
--    Keeps: specialty, avatar, category, duration (old names) + adds new columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION INIT_BEAUTY_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix TEXT;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- -----------------------------------------------------------------------
    -- 8a. beauty_specialists
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            code             VARCHAR(50),
            name             VARCHAR(255) NOT NULL,
            specialty        VARCHAR(255),           -- kept for 002 compat
            phone            VARCHAR(50),
            email            VARCHAR(255),
            specialties      TEXT[]       DEFAULT ''{}'',
            category_codes   TEXT[]       DEFAULT ''{}'',
            commission_rate  DECIMAL(5,2) DEFAULT 0,
            base_salary      DECIMAL(15,2) DEFAULT 0,
            color            VARCHAR(50)  DEFAULT ''#6366F1'',
            avatar           TEXT,
            is_active        BOOLEAN      DEFAULT true,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_beauty_specialists');

    -- ALTER: add missing cols to existing tables
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS code            VARCHAR(50)',                 v_prefix || '_beauty_specialists');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS phone           VARCHAR(50)',                 v_prefix || '_beauty_specialists');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS email           VARCHAR(255)',                v_prefix || '_beauty_specialists');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialties     TEXT[]  DEFAULT ''{}''',     v_prefix || '_beauty_specialists');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS category_codes  TEXT[]  DEFAULT ''{}''',     v_prefix || '_beauty_specialists');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 0',     v_prefix || '_beauty_specialists');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS base_salary     DECIMAL(15,2) DEFAULT 0',    v_prefix || '_beauty_specialists');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS color           VARCHAR(50) DEFAULT ''#6366F1''', v_prefix || '_beauty_specialists');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_prefix || '_beauty_specialists');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (is_active)',
        'idx_' || v_prefix || '_beauty_specialists_active', v_prefix || '_beauty_specialists');

    -- -----------------------------------------------------------------------
    -- 8b. beauty_services (keep category! service orders by category, name)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            code             VARCHAR(50),
            name             VARCHAR(255) NOT NULL,
            category         VARCHAR(100),           -- kept for ORDER BY category compat
            category_code    VARCHAR(50),            -- beauty.service_categories.code
            duration         INTEGER      DEFAULT 30, -- kept for compat
            duration_min     INTEGER      DEFAULT 30, -- 054 alias
            price            DECIMAL(15,2) NOT NULL DEFAULT 0,
            cost             DECIMAL(15,2) DEFAULT 0,
            color            VARCHAR(50)  DEFAULT ''#8B5CF6'',
            requires_device  BOOLEAN      DEFAULT false,
            device_type_code VARCHAR(50),
            description      TEXT,
            is_active        BOOLEAN      DEFAULT true,
            display_order    INTEGER      DEFAULT 0,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_beauty_services');

    -- ALTER: add missing cols to existing tables
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS code             VARCHAR(50)',                 v_prefix || '_beauty_services');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS category_code    VARCHAR(50)',                 v_prefix || '_beauty_services');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS duration_min     INTEGER DEFAULT 30',          v_prefix || '_beauty_services');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS cost             DECIMAL(15,2) DEFAULT 0',    v_prefix || '_beauty_services');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS requires_device  BOOLEAN DEFAULT false',       v_prefix || '_beauty_services');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS device_type_code VARCHAR(50)',                 v_prefix || '_beauty_services');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS description      TEXT',                        v_prefix || '_beauty_services');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS display_order    INTEGER DEFAULT 0',           v_prefix || '_beauty_services');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_prefix || '_beauty_services');

    -- -----------------------------------------------------------------------
    -- 8c. beauty_packages (keep old cols + add is_active + new definition cols)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name             VARCHAR(255),
            service_id       UUID,
            total_sessions   INTEGER      NOT NULL DEFAULT 1,
            price            DECIMAL(15,2) DEFAULT 0,
            validity_days    INTEGER      DEFAULT 365,
            -- Kept from 002: client tracking fields (now in package_sales period table)
            client_id        UUID,
            remaining_sessions INTEGER   DEFAULT 1,
            expiry_date      DATE,
            is_active        BOOLEAN      DEFAULT true,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_beauty_packages');

    -- ALTER: add missing cols to existing tables
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT true',           v_prefix || '_beauty_packages');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS name           VARCHAR(255)',                   v_prefix || '_beauty_packages');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price          DECIMAL(15,2) DEFAULT 0',        v_prefix || '_beauty_packages');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS validity_days  INTEGER DEFAULT 365',            v_prefix || '_beauty_packages');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_prefix || '_beauty_packages');

    -- -----------------------------------------------------------------------
    -- 8d. beauty_devices
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name             VARCHAR(255) NOT NULL,
            serial_number    VARCHAR(100) UNIQUE,
            device_type_code VARCHAR(50),
            brand            VARCHAR(100),
            model            VARCHAR(100),
            room_id          UUID,
            total_shots      BIGINT       DEFAULT 0,
            max_shots        BIGINT,
            last_maintenance DATE,
            next_maintenance DATE,
            purchase_date    DATE,
            warranty_date    DATE,
            status           VARCHAR(20)  DEFAULT ''active'',
            notes            TEXT,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_beauty_devices');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (status)',
        'idx_' || v_prefix || '_beauty_devices_status', v_prefix || '_beauty_devices');

    RAISE NOTICE 'Beauty firm tables fixed/created for firm %', p_firm_nr;
END;
$$ LANGUAGE plpgsql;
