-- ============================================================================
-- RetailEX - BEAUTY COMPLETE SCHEMA (v7.0)
-- Migration 078
-- ----------------------------------------------------------------------------
-- 1. Update INIT_BEAUTY_FIRM_TABLES with full column sets
-- 2. Update INIT_BEAUTY_PERIOD_TABLES with new tables
-- 3. Create static beauty.body_regions table + seed data (13 bölge)
-- 4. ALTER existing beauty tables (add missing columns, idempotent)
-- 5. Create missing tables for existing firm+period (idempotent)
-- ============================================================================

-- ============================================================================
-- SECTION 1: Update INIT_BEAUTY_FIRM_TABLES with full schema
--   (Called by 004_seed_data.sql for firm '001' on first install;
--    also safe to call again — all CREATE TABLE use IF NOT EXISTS)
-- ============================================================================
CREATE OR REPLACE FUNCTION INIT_BEAUTY_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
    -- beauty_specialists (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(255) NOT NULL,
        phone           VARCHAR(50),
        email           VARCHAR(255),
        specialty       VARCHAR(100),
        color           VARCHAR(20) DEFAULT ''#9333ea'',
        commission_rate DECIMAL(5,2) DEFAULT 0,
        avatar_url      TEXT,
        working_hours   JSONB,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_specialists');

    -- beauty_services (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(255) NOT NULL,
        category        VARCHAR(50) DEFAULT ''beauty'',
        duration_min    INTEGER DEFAULT 30,
        price           DECIMAL(15,2) DEFAULT 0,
        cost_price      DECIMAL(15,2) DEFAULT 0,
        color           VARCHAR(20) DEFAULT ''#9333ea'',
        commission_rate DECIMAL(5,2) DEFAULT 0,
        description     TEXT,
        requires_device BOOLEAN DEFAULT false,
        expected_shots  INTEGER DEFAULT 0,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_services');

    -- beauty_packages (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        service_id      UUID,
        total_sessions  INTEGER DEFAULT 1,
        price           DECIMAL(15,2) DEFAULT 0,
        cost_price      DECIMAL(15,2) DEFAULT 0,
        discount_pct    DECIMAL(5,2) DEFAULT 0,
        validity_days   INTEGER DEFAULT 365,
        color           VARCHAR(20) DEFAULT ''#6366f1'',
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_packages');

    -- beauty_devices (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name             VARCHAR(255) NOT NULL,
        device_type      VARCHAR(50) DEFAULT ''laser'',
        serial_number    VARCHAR(100),
        manufacturer     VARCHAR(100),
        model            VARCHAR(100),
        total_shots      BIGINT DEFAULT 0,
        max_shots        BIGINT DEFAULT 500000,
        maintenance_due  DATE,
        last_maintenance DATE,
        purchase_date    DATE,
        warranty_expiry  DATE,
        status           VARCHAR(20) DEFAULT ''active'',
        notes            TEXT,
        is_active        BOOLEAN DEFAULT true,
        created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_devices');

    -- beauty_leads (CRM pipeline — firm card table)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name                  VARCHAR(255) NOT NULL,
        phone                 VARCHAR(50),
        email                 VARCHAR(255),
        source                VARCHAR(30) DEFAULT ''other'',
        status                VARCHAR(30) DEFAULT ''new'',
        interested_services   JSONB DEFAULT ''[]'',
        notes                 TEXT,
        assigned_to           UUID,
        first_contact_date    DATE DEFAULT CURRENT_DATE,
        last_contact_date     DATE,
        converted_customer_id UUID,
        lost_reason           TEXT,
        created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_leads');

END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- SECTION 2: Update INIT_BEAUTY_PERIOD_TABLES with full schema + new tables
-- ============================================================================
CREATE OR REPLACE FUNCTION INIT_BEAUTY_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
    -- beauty_appointments (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        client_id           UUID,
        service_id          UUID,
        specialist_id       UUID,
        device_id           UUID,
        body_region_id      UUID,
        appointment_date    DATE,
        appointment_time    TIME,
        duration            INTEGER DEFAULT 30,
        status              VARCHAR(20) DEFAULT ''scheduled'',
        type                VARCHAR(20) DEFAULT ''regular'',
        notes               TEXT,
        total_price         DECIMAL(15,2) DEFAULT 0,
        commission_amount   DECIMAL(15,2) DEFAULT 0,
        is_package_session  BOOLEAN DEFAULT false,
        package_purchase_id UUID,
        reminder_sent       BOOLEAN DEFAULT false,
        created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_appointments');

    -- beauty_sessions
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id     UUID,
        specialist_id   UUID,
        service_id      UUID,
        appointment_id  UUID,
        session_date    DATE DEFAULT CURRENT_DATE,
        shots_used      INTEGER DEFAULT 0,
        skin_type       VARCHAR(20),
        before_photo    TEXT,
        after_photo     TEXT,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_sessions');

    -- beauty_session_logs
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        package_purchase_id UUID,
        appointment_id      UUID,
        session_number      INTEGER,
        recorded_at         TIMESTAMPTZ DEFAULT NOW()
    )', v_prefix || '_beauty_session_logs');

    -- beauty_package_purchases (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id        UUID,
        package_id         UUID,
        total_sessions     INTEGER DEFAULT 1,
        used_sessions      INTEGER DEFAULT 0,
        remaining_sessions INTEGER DEFAULT 1,
        sale_price         DECIMAL(15,2) DEFAULT 0,
        purchase_date      DATE DEFAULT CURRENT_DATE,
        expiry_date        DATE,
        status             VARCHAR(20) DEFAULT ''active'',
        created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_package_purchases');

    -- beauty_package_sales (legacy alias)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id     UUID,
        package_id      UUID,
        total_sessions  INTEGER,
        sale_price      DECIMAL(15,2),
        sale_date       DATE,
        expiry_date     DATE,
        status          VARCHAR(20)
    )', v_prefix || '_beauty_package_sales');

    -- beauty_device_usage (full schema)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id       UUID,
        appointment_id  UUID,
        customer_id     UUID,
        specialist_id   UUID,
        body_region_id  UUID,
        shots_used      INTEGER DEFAULT 0,
        expected_shots  INTEGER DEFAULT 0,
        is_excessive    BOOLEAN DEFAULT false,
        usage_date      DATE DEFAULT CURRENT_DATE,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_device_usage');

    -- beauty_device_alerts (NEW)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id    UUID,
        usage_id     UUID,
        alert_type   VARCHAR(50),
        message      TEXT,
        severity     VARCHAR(20) DEFAULT ''warning'',
        acknowledged BOOLEAN DEFAULT false,
        created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_device_alerts');

    -- beauty_customer_feedback (NEW)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        appointment_id     UUID,
        customer_id        UUID,
        service_rating     SMALLINT DEFAULT 5,
        staff_rating       SMALLINT DEFAULT 5,
        cleanliness_rating SMALLINT DEFAULT 5,
        overall_rating     SMALLINT DEFAULT 5,
        comment            TEXT,
        would_recommend    BOOLEAN DEFAULT true,
        created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_customer_feedback');

    -- beauty_sales (NEW — beauty POS)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_number   VARCHAR(30),
        customer_id      UUID,
        subtotal         DECIMAL(15,2) DEFAULT 0,
        discount         DECIMAL(15,2) DEFAULT 0,
        tax              DECIMAL(15,2) DEFAULT 0,
        total            DECIMAL(15,2) DEFAULT 0,
        payment_method   VARCHAR(30) DEFAULT ''cash'',
        payment_status   VARCHAR(20) DEFAULT ''paid'',
        paid_amount      DECIMAL(15,2) DEFAULT 0,
        remaining_amount DECIMAL(15,2) DEFAULT 0,
        notes            TEXT,
        created_by       UUID,
        created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_sales');

    -- beauty_sale_items (NEW)
    EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sale_id           UUID,
        item_type         VARCHAR(20) DEFAULT ''service'',
        item_id           UUID,
        name              VARCHAR(255),
        quantity          INTEGER DEFAULT 1,
        unit_price        DECIMAL(15,2) DEFAULT 0,
        discount          DECIMAL(15,2) DEFAULT 0,
        total             DECIMAL(15,2) DEFAULT 0,
        staff_id          UUID,
        commission_amount DECIMAL(15,2) DEFAULT 0,
        created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )', v_prefix || '_beauty_sale_items');

END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- SECTION 3: Shared static table — beauty.body_regions
--   (No firm prefix; beauty schema pre-created by migration runner)
-- ============================================================================
CREATE TABLE IF NOT EXISTS beauty.body_regions (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(100) NOT NULL UNIQUE,
    avg_shots  INTEGER DEFAULT 100,
    min_shots  INTEGER DEFAULT 50,
    max_shots  INTEGER DEFAULT 200,
    sort_order INTEGER DEFAULT 0
);

-- Seed (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO beauty.body_regions (name, avg_shots, min_shots, max_shots, sort_order) VALUES
    ('Yüz',              200, 150, 350,  1),
    ('Koltuk Altı',      150, 100, 250,  2),
    ('Bacak (Tam)',     1200, 800,1800,  3),
    ('Bacak (Alt Yarı)', 600, 400, 900,  4),
    ('Bacak (Üst Yarı)', 600, 400, 900,  5),
    ('Bikini (Tam)',     300, 200, 500,  6),
    ('Bikini (Dar)',     150, 100, 250,  7),
    ('Kol (Tam)',        500, 350, 750,  8),
    ('Kol (Yarım)',      250, 175, 400,  9),
    ('Sırt',             800, 500,1200, 10),
    ('Göğüs',            500, 300, 800, 11),
    ('Yüz + Boyun',      350, 250, 500, 12),
    ('Bıyık / Çene',     100,  60, 180, 13)
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- SECTION 4: Upgrade existing beauty tables (ALTER TABLE + new table creates)
--   Runs for every existing firm/period. All operations are idempotent.
-- ============================================================================
DO $$
DECLARE
    r       RECORD;
    v_table TEXT;
BEGIN

    -- ── beauty_specialists: add missing columns ────────────────────────────
    FOR r IN
        SELECT table_schema || '.' || table_name AS full_name
        FROM information_schema.tables
        WHERE table_schema = 'beauty'
          AND table_name LIKE 'rex_%_beauty_specialists'
    LOOP
        v_table := r.full_name;
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS email VARCHAR(255)', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS specialty VARCHAR(100)', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT ''#9333ea''', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 0', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS avatar_url TEXT', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS working_hours JSONB', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_table);
    END LOOP;

    -- ── beauty_services: add missing columns ──────────────────────────────
    FOR r IN
        SELECT table_schema || '.' || table_name AS full_name
        FROM information_schema.tables
        WHERE table_schema = 'beauty'
          AND table_name LIKE 'rex_%_beauty_services'
    LOOP
        v_table := r.full_name;
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT ''beauty''', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT ''#9333ea''', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 0', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS cost_price DECIMAL(15,2) DEFAULT 0', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS description TEXT', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS requires_device BOOLEAN DEFAULT false', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS expected_shots INTEGER DEFAULT 0', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS duration_min INTEGER DEFAULT 30', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_table);
    END LOOP;

    -- ── beauty_packages: add missing columns ──────────────────────────────
    FOR r IN
        SELECT table_schema || '.' || table_name AS full_name
        FROM information_schema.tables
        WHERE table_schema = 'beauty'
          AND table_name LIKE 'rex_%_beauty_packages'
    LOOP
        v_table := r.full_name;
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS description TEXT', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS cost_price DECIMAL(15,2) DEFAULT 0', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS discount_pct DECIMAL(5,2) DEFAULT 0', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 365', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT ''#6366f1''', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_table);
    END LOOP;

    -- ── beauty_devices: add missing columns ───────────────────────────────
    FOR r IN
        SELECT table_schema || '.' || table_name AS full_name
        FROM information_schema.tables
        WHERE table_schema = 'beauty'
          AND table_name LIKE 'rex_%_beauty_devices'
    LOOP
        v_table := r.full_name;
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) DEFAULT ''laser''', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100)', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS model VARCHAR(100)', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS max_shots BIGINT DEFAULT 500000', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS maintenance_due DATE', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS last_maintenance DATE', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS purchase_date DATE', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS warranty_expiry DATE', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS notes TEXT', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_table);
    END LOOP;

    -- ── beauty_appointments: add missing columns ───────────────────────────
    FOR r IN
        SELECT table_schema || '.' || table_name AS full_name
        FROM information_schema.tables
        WHERE table_schema = 'beauty'
          AND table_name LIKE 'rex_%_%_beauty_appointments'
    LOOP
        v_table := r.full_name;
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS device_id UUID', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS body_region_id UUID', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT ''regular''', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(15,2) DEFAULT 0', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS package_purchase_id UUID', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false', v_table);
        EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_table);
    END LOOP;

    -- ── Create beauty_leads for each existing firm ────────────────────────
    FOR r IN
        SELECT DISTINCT
            regexp_replace(table_name, '_beauty_specialists$', '') AS firm_prefix
        FROM information_schema.tables
        WHERE table_schema = 'beauty'
          AND table_name LIKE 'rex_%_beauty_specialists'
    LOOP
        EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
            id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name                  VARCHAR(255) NOT NULL,
            phone                 VARCHAR(50),
            email                 VARCHAR(255),
            source                VARCHAR(30) DEFAULT ''other'',
            status                VARCHAR(30) DEFAULT ''new'',
            interested_services   JSONB DEFAULT ''[]'',
            notes                 TEXT,
            assigned_to           UUID,
            first_contact_date    DATE DEFAULT CURRENT_DATE,
            last_contact_date     DATE,
            converted_customer_id UUID,
            lost_reason           TEXT,
            created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )', r.firm_prefix || '_beauty_leads');
    END LOOP;

    -- ── Create new movement tables for each existing firm+period ──────────
    FOR r IN
        SELECT DISTINCT
            regexp_replace(table_name, '_beauty_appointments$', '') AS period_prefix
        FROM information_schema.tables
        WHERE table_schema = 'beauty'
          AND table_name LIKE 'rex_%_%_beauty_appointments'
    LOOP
        -- beauty_device_alerts
        EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            device_id    UUID,
            usage_id     UUID,
            alert_type   VARCHAR(50),
            message      TEXT,
            severity     VARCHAR(20) DEFAULT ''warning'',
            acknowledged BOOLEAN DEFAULT false,
            created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )', r.period_prefix || '_beauty_device_alerts');

        -- beauty_customer_feedback
        EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
            id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            appointment_id     UUID,
            customer_id        UUID,
            service_rating     SMALLINT DEFAULT 5,
            staff_rating       SMALLINT DEFAULT 5,
            cleanliness_rating SMALLINT DEFAULT 5,
            overall_rating     SMALLINT DEFAULT 5,
            comment            TEXT,
            would_recommend    BOOLEAN DEFAULT true,
            created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )', r.period_prefix || '_beauty_customer_feedback');

        -- beauty_sales
        EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            invoice_number   VARCHAR(30),
            customer_id      UUID,
            subtotal         DECIMAL(15,2) DEFAULT 0,
            discount         DECIMAL(15,2) DEFAULT 0,
            tax              DECIMAL(15,2) DEFAULT 0,
            total            DECIMAL(15,2) DEFAULT 0,
            payment_method   VARCHAR(30) DEFAULT ''cash'',
            payment_status   VARCHAR(20) DEFAULT ''paid'',
            paid_amount      DECIMAL(15,2) DEFAULT 0,
            remaining_amount DECIMAL(15,2) DEFAULT 0,
            notes            TEXT,
            created_by       UUID,
            created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )', r.period_prefix || '_beauty_sales');

        -- beauty_sale_items
        EXECUTE format('CREATE TABLE IF NOT EXISTS beauty.%I (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            sale_id           UUID,
            item_type         VARCHAR(20) DEFAULT ''service'',
            item_id           UUID,
            name              VARCHAR(255),
            quantity          INTEGER DEFAULT 1,
            unit_price        DECIMAL(15,2) DEFAULT 0,
            discount          DECIMAL(15,2) DEFAULT 0,
            total             DECIMAL(15,2) DEFAULT 0,
            staff_id          UUID,
            commission_amount DECIMAL(15,2) DEFAULT 0,
            created_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )', r.period_prefix || '_beauty_sale_items');
    END LOOP;

END $$;
