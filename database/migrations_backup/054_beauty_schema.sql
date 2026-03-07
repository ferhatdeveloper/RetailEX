-- ============================================================================
-- RetailEx - BEAUTY SCHEMA (v1.0)
-- ----------------------------------------------------------------------------
-- Dedicated `beauty` schema for all beauty/salon/clinic module tables.
--
-- Table ownership:
--   beauty.*             → Global / store-level (schema-qualified, no prefix)
--   rex_{firm}_beauty_*  → Firm-specific card tables (via CREATE_FIRM_TABLES)
--   rex_{firm}_{period}_beauty_* → Period movement tables (via CREATE_PERIOD_TABLES)
--
-- New schemas created here:
--   beauty   → Güzellik / Klinik / SPA modülü
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Create the beauty schema and ensure extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS beauty;

-- ---------------------------------------------------------------------------
-- 1. beauty.update_timestamp()  (trigger helper, shared in schema)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beauty.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 2. beauty.device_types  (Cihaz Türleri — global katalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beauty.device_types (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(50) UNIQUE NOT NULL,       -- 'laser_diode', 'ipl', 'rf', 'ultrasound'
    name        VARCHAR(100) NOT NULL,             -- 'Lazer Diyot', 'IPL'
    description TEXT,
    unit        VARCHAR(20) DEFAULT 'shots',       -- shots | minutes | sessions
    is_active   BOOLEAN     DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO beauty.device_types (code, name, description, unit) VALUES
    ('laser_diode', 'Lazer Diyot',     '808/755/1064nm epilasyon', 'shots'),
    ('ipl',         'IPL',             'Intense Pulsed Light',     'shots'),
    ('rf',          'Radyofrekans',    'Cilt sıkılaştırma / gençleştirme', 'minutes'),
    ('ultrasound',  'Ultrason (HIFU)', 'Yüz germe / lifting',      'minutes'),
    ('cavitation',  'Kavitasyon',      'Selülit / vücut şekillendirme', 'minutes'),
    ('cryolipolysis','Kriyolipoliz',   'Yağ dondurama (CoolSculpting)', 'sessions'),
    ('co2_laser',   'CO2 Lazer',       'Leke / skar / cilt yenileme',  'shots'),
    ('led_therapy', 'LED Terapi',      'Işık terapi / anti-aging',     'minutes')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. beauty.rooms  (Tedavi / Randevu Odaları — store bazlı)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beauty.rooms (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id      UUID        REFERENCES public.stores(id) ON DELETE CASCADE,
    code          VARCHAR(20) NOT NULL,            -- 'ODA-1', 'LAZER-2'
    name          VARCHAR(100) NOT NULL,           -- 'Lazer Odası 1'
    capacity      INTEGER     DEFAULT 1,           -- Eşzamanlı randevu kapasitesi
    color         VARCHAR(50) DEFAULT '#6366F1',   -- Takvim rengi
    allowed_device_types TEXT[] DEFAULT '{}',      -- device_types.code listesi
    is_active     BOOLEAN     DEFAULT true,
    display_order INTEGER     DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, code)
);

CREATE INDEX IF NOT EXISTS idx_beauty_rooms_store
    ON beauty.rooms(store_id) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_beauty_rooms_updated ON beauty.rooms;
CREATE TRIGGER trg_beauty_rooms_updated
    BEFORE UPDATE ON beauty.rooms
    FOR EACH ROW EXECUTE FUNCTION beauty.update_timestamp();

-- ---------------------------------------------------------------------------
-- 4. beauty.service_categories  (Hizmet Kategorileri — global)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beauty.service_categories (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    code          VARCHAR(50) UNIQUE NOT NULL,
    name          VARCHAR(100) NOT NULL,
    color         VARCHAR(50) DEFAULT '#8B5CF6',
    icon          VARCHAR(50) DEFAULT 'scissors',
    display_order INTEGER     DEFAULT 0,
    is_active     BOOLEAN     DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO beauty.service_categories (code, name, color, icon, display_order) VALUES
    ('epilasyon',   'Epilasyon',            '#8B5CF6', 'zap',          1),
    ('cilt_bakimi', 'Cilt Bakımı',          '#EC4899', 'sparkles',     2),
    ('sac_bakim',   'Saç Bakım',            '#F59E0B', 'scissors',     3),
    ('manikur',     'Manikür / Pedikür',    '#EF4444', 'hand',         4),
    ('masaj',       'Masaj / Terapi',       '#10B981', 'activity',     5),
    ('estetik',     'Estetik / Lifting',    '#3B82F6', 'award',        6),
    ('kalici_makyaj','Kalıcı Makyaj',       '#F97316', 'edit',         7),
    ('diger',       'Diğer',               '#6B7280', 'more-horizontal', 99)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. INIT_BEAUTY_FIRM_TABLES(firmNr)
--    Firm-specific beauty card tables:
--      {firm}_beauty_specialists   → Uzmanlar
--      {firm}_beauty_services      → Hizmetler
--      {firm}_beauty_packages      → Paketler (seans)
--      {firm}_beauty_devices       → Cihazlar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION INIT_BEAUTY_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix TEXT;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- -----------------------------------------------------------------------
    -- 5a. Specialists (Uzmanlar)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            code             VARCHAR(50),
            name             VARCHAR(255) NOT NULL,
            phone            VARCHAR(50),
            email            VARCHAR(255),
            specialties      TEXT[]       DEFAULT ''{}'',
            category_codes   TEXT[]       DEFAULT ''{}'',  -- beauty.service_categories.code
            commission_rate  DECIMAL(5,2) DEFAULT 0,
            base_salary      DECIMAL(15,2) DEFAULT 0,
            color            VARCHAR(50)  DEFAULT ''#6366F1'',
            avatar           TEXT,
            is_active        BOOLEAN      DEFAULT true,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_beauty_specialists');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (is_active);',
        'idx_' || v_prefix || '_beauty_specialists_active',
        v_prefix || '_beauty_specialists');

    -- -----------------------------------------------------------------------
    -- 5b. Services (Hizmetler)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            code             VARCHAR(50),
            name             VARCHAR(255) NOT NULL,
            category_code    VARCHAR(50),            -- beauty.service_categories.code
            duration_min     INTEGER      NOT NULL DEFAULT 30,
            price            DECIMAL(15,2) NOT NULL DEFAULT 0,
            cost             DECIMAL(15,2) DEFAULT 0,
            color            VARCHAR(50)  DEFAULT ''#8B5CF6'',
            requires_device  BOOLEAN      DEFAULT false,
            device_type_code VARCHAR(50),            -- beauty.device_types.code
            description      TEXT,
            is_active        BOOLEAN      DEFAULT true,
            display_order    INTEGER      DEFAULT 0,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_beauty_services');

    -- -----------------------------------------------------------------------
    -- 5c. Packages (Seans Paketleri)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name             VARCHAR(255) NOT NULL,
            service_id       UUID,                   -- → {firm}_beauty_services(id)
            total_sessions   INTEGER      NOT NULL DEFAULT 1,
            price            DECIMAL(15,2) NOT NULL DEFAULT 0,
            validity_days    INTEGER      DEFAULT 365,
            is_active        BOOLEAN      DEFAULT true,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_beauty_packages');

    -- -----------------------------------------------------------------------
    -- 5d. Devices (Cihazlar)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name             VARCHAR(255) NOT NULL,
            serial_number    VARCHAR(100) UNIQUE,
            device_type_code VARCHAR(50),            -- beauty.device_types.code
            brand            VARCHAR(100),
            model            VARCHAR(100),
            room_id          UUID,                   -- → beauty.rooms(id)
            total_shots      BIGINT       DEFAULT 0,
            max_shots        BIGINT,
            last_maintenance DATE,
            next_maintenance DATE,
            purchase_date    DATE,
            warranty_date    DATE,
            status           VARCHAR(20)  DEFAULT ''active'',
                                                     -- active | maintenance | inactive
            notes            TEXT,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_beauty_devices');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (status);',
        'idx_' || v_prefix || '_beauty_devices_status',
        v_prefix || '_beauty_devices');

    RAISE NOTICE 'Beauty firm tables created for firm %', p_firm_nr;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 6. INIT_BEAUTY_PERIOD_TABLES(firmNr, periodNr)
--    Period-specific beauty movement tables:
--      {firm}_{period}_beauty_appointments   → Randevular
--      {firm}_{period}_beauty_sessions       → Gerçekleşen seanslar (detay)
--      {firm}_{period}_beauty_package_sales  → Paket satışları
--      {firm}_{period}_beauty_device_usage   → Cihaz kullanım log
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION INIT_BEAUTY_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix TEXT;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr || '_' || p_period_nr);

    -- -----------------------------------------------------------------------
    -- 6a. Appointments (Randevular)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            appt_no          VARCHAR(50) UNIQUE,
            customer_id      UUID,                   -- → {firm}_customers(id)
            specialist_id    UUID,                   -- → {firm}_beauty_specialists(id)
            service_id       UUID,                   -- → {firm}_beauty_services(id)
            room_id          UUID,                   -- → beauty.rooms(id)
            device_id        UUID,                   -- → {firm}_beauty_devices(id)
            appt_date        DATE         NOT NULL,
            appt_time        TIME         NOT NULL,
            duration_min     INTEGER      DEFAULT 30,
            status           VARCHAR(20)  DEFAULT ''scheduled'',
                                                     -- scheduled | confirmed | in_progress
                                                     -- | completed | cancelled | noshow
            total_price      DECIMAL(15,2) DEFAULT 0,
            paid_amount      DECIMAL(15,2) DEFAULT 0,
            package_sale_id  UUID,                   -- → {period}_beauty_package_sales(id)
            is_package_session BOOLEAN    DEFAULT false,
            session_number   INTEGER,                -- Paket kaçıncı seans
            notes            TEXT,
            cancel_reason    TEXT,
            created_by       VARCHAR(255),
            confirmed_at     TIMESTAMPTZ,
            started_at       TIMESTAMPTZ,
            completed_at     TIMESTAMPTZ,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_beauty_appointments');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (appt_date, status);',
        'idx_' || v_prefix || '_beauty_appts_date',
        v_prefix || '_beauty_appointments');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (customer_id);',
        'idx_' || v_prefix || '_beauty_appts_customer',
        v_prefix || '_beauty_appointments');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (specialist_id);',
        'idx_' || v_prefix || '_beauty_appts_specialist',
        v_prefix || '_beauty_appointments');

    -- -----------------------------------------------------------------------
    -- 6b. Sessions (Gerçekleşen Seans Detayları)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            appointment_id   UUID,                   -- → {period}_beauty_appointments(id)
            customer_id      UUID,
            specialist_id    UUID,
            service_id       UUID,
            device_id        UUID,
            session_date     DATE         NOT NULL,
            duration_min     INTEGER      DEFAULT 0,
            shots_used       INTEGER      DEFAULT 0,
            fluence          DECIMAL(6,2),           -- J/cm² — lazer yoğunluğu
            spot_size        VARCHAR(20),            -- mm
            skin_type        VARCHAR(20),            -- Fitzpatrick I-VI
            treated_area     TEXT,                   -- Bacak, Koltuk altı, Bikini...
            before_photo     TEXT,                   -- Foto URL / path
            after_photo      TEXT,
            practitioner_notes TEXT,
            customer_feedback  TEXT,
            rating           SMALLINT,               -- 1-5
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_beauty_sessions');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (appointment_id);',
        'idx_' || v_prefix || '_beauty_sessions_appt',
        v_prefix || '_beauty_sessions');

    -- -----------------------------------------------------------------------
    -- 6c. Package Sales (Paket Satışları)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            sale_no          VARCHAR(50) UNIQUE,
            customer_id      UUID,                   -- → {firm}_customers(id)
            package_id       UUID,                   -- → {firm}_beauty_packages(id)
            service_id       UUID,                   -- → {firm}_beauty_services(id)
            total_sessions   INTEGER      NOT NULL,
            used_sessions    INTEGER      DEFAULT 0,
            remaining_sessions INTEGER    GENERATED ALWAYS AS (total_sessions - used_sessions) STORED,
            sale_price       DECIMAL(15,2) NOT NULL,
            paid_amount      DECIMAL(15,2) DEFAULT 0,
            sale_date        DATE         NOT NULL DEFAULT CURRENT_DATE,
            expiry_date      DATE,
            status           VARCHAR(20)  DEFAULT ''active'',
                                                     -- active | completed | expired | cancelled
            notes            TEXT,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_beauty_package_sales');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (customer_id, status);',
        'idx_' || v_prefix || '_beauty_pkg_sales_customer',
        v_prefix || '_beauty_package_sales');

    -- -----------------------------------------------------------------------
    -- 6d. Device Usage Log (Cihaz Kullanım Logu)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            device_id        UUID,                   -- → {firm}_beauty_devices(id)
            session_id       UUID,                   -- → {period}_beauty_sessions(id)
            specialist_id    UUID,
            usage_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
            shots_used       INTEGER      DEFAULT 0,
            duration_min     INTEGER      DEFAULT 0,
            fluence          DECIMAL(6,2),
            head_type        VARCHAR(50),            -- Başlık türü
            notes            TEXT,
            created_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_beauty_device_usage');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (device_id, usage_date);',
        'idx_' || v_prefix || '_beauty_device_usage_device',
        v_prefix || '_beauty_device_usage');

    RAISE NOTICE 'Beauty period tables created for %_%', p_firm_nr, p_period_nr;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 7. Migrate existing beauty tables from public schema (if any)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- Migrate beauty_specialists data if old table exists in public
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'beauty_specialists'
    ) THEN
        RAISE NOTICE 'Found public.beauty_specialists — data is in firm-prefixed tables, no migration needed.';
    END IF;
END $$;
