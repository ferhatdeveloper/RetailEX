-- ============================================================================
-- RetailEx - RESTAURANT SCHEMA (v3.3)
-- ----------------------------------------------------------------------------
-- Dedicated `rest` schema for all restaurant module tables.
--
-- Table ownership:
--   rest.*              → Global / store-level (schema-qualified, no prefix rewrite)
--   {firm}_rest_*       → Firm-specific card tables  (auto-prefixed by pg service)
--   {firm}_{period}_rest_* → Period-specific movement tables (auto-prefixed)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Create the rest schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS rest;

-- ---------------------------------------------------------------------------
-- 1. rest.floors  (Kat / Alan tanımları — global, mağaza bazlı)
--    Replaces public.rest_floors from migration 048
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rest.floors (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id       UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name           VARCHAR(100) NOT NULL,           -- 'Salon', 'Teras', 'Bahçe'
    color          VARCHAR(50)  DEFAULT '#3B82F6',  -- UI accent color
    display_order  INTEGER      DEFAULT 0,
    is_active      BOOLEAN      DEFAULT true,
    created_at     TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rest_floors_store
    ON rest.floors(store_id);

-- Migrate existing rows from public.rest_floors if the old table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'rest_floors') THEN
        INSERT INTO rest.floors (id, store_id, name, display_order, is_active, created_at)
        SELECT id, store_id, name, display_order, is_active, created_at
        FROM   public.rest_floors
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. rest.kroki_layouts  (Görsel masa düzeni — global, mağaza bazlı)
--    Replaces public.rest_kroki_layouts from migration 052
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rest.kroki_layouts (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    floor_name    VARCHAR(100) NOT NULL DEFAULT 'Tümü',
    layout_data   JSONB        NOT NULL DEFAULT '{}',
    hidden_tables TEXT[]       DEFAULT '{}',
    updated_by    VARCHAR(255),
    created_at    TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, floor_name)
);

CREATE INDEX IF NOT EXISTS idx_rest_kroki_store_floor
    ON rest.kroki_layouts(store_id, floor_name);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION rest.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rest_kroki_updated ON rest.kroki_layouts;
CREATE TRIGGER trg_rest_kroki_updated
    BEFORE UPDATE ON rest.kroki_layouts
    FOR EACH ROW EXECUTE FUNCTION rest.update_timestamp();

DROP TRIGGER IF EXISTS trg_rest_floors_updated ON rest.floors;
CREATE TRIGGER trg_rest_floors_updated
    BEFORE UPDATE ON rest.floors
    FOR EACH ROW EXECUTE FUNCTION rest.update_timestamp();

-- Migrate existing rows from public.rest_kroki_layouts if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'rest_kroki_layouts') THEN
        INSERT INTO rest.kroki_layouts
               (id, store_id, floor_name, layout_data, hidden_tables, updated_by, created_at, updated_at)
        SELECT  id, store_id, floor_name, layout_data, hidden_tables, updated_by, created_at, updated_at
        FROM    public.rest_kroki_layouts
        ON CONFLICT (store_id, floor_name) DO NOTHING;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. rest.printer_profiles  (Yazıcı profilleri — global, mağaza bazlı)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rest.printer_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id        UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    type            VARCHAR(20)  DEFAULT 'thermal',    -- thermal | standard
    connection_type VARCHAR(20)  DEFAULT 'network',    -- network | usb | bluetooth
    address         VARCHAR(255),
    port            INTEGER      DEFAULT 9100,
    is_common       BOOLEAN      DEFAULT false,        -- Ortak yazıcı mı?
    status          VARCHAR(20)  DEFAULT 'offline',
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rest_printer_profiles_store
    ON rest.printer_profiles(store_id);

DROP TRIGGER IF EXISTS trg_rest_printer_profiles_updated ON rest.printer_profiles;
CREATE TRIGGER trg_rest_printer_profiles_updated
    BEFORE UPDATE ON rest.printer_profiles
    FOR EACH ROW EXECUTE FUNCTION rest.update_timestamp();

-- ---------------------------------------------------------------------------
-- 4. rest.printer_routes  (Kategori → Yazıcı yönlendirmesi — global)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rest.printer_routes (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    category_name VARCHAR(100) NOT NULL,
    printer_id    UUID REFERENCES rest.printer_profiles(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rest_printer_routes_store
    ON rest.printer_routes(store_id);

-- ---------------------------------------------------------------------------
-- 5. INIT_RESTAURANT_PERIOD_TABLES(firmNr, periodNr)
--    Creates period-specific restaurant movement tables.
--    Called from SetupWizard after init_period_schema when restaurant mode.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION INIT_RESTAURANT_PERIOD_TABLES(
    p_firm_nr   VARCHAR,
    p_period_nr VARCHAR
)
RETURNS void AS $$
DECLARE
    v_prefix TEXT;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr || '_' || p_period_nr);

    -- -----------------------------------------------------------------------
    -- 5a. Rest Orders (Sipariş Başlığı)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_no        VARCHAR(50) UNIQUE,
            table_id        UUID,             -- → {firm}_rest_tables(id)
            floor_id        UUID,             -- → rest.floors(id)
            waiter          VARCHAR(255),
            customer_id     UUID,             -- → {firm}_customers(id)
            status          VARCHAR(20) DEFAULT ''open'',
                                              -- open | billed | closed | cancelled
            total_amount    DECIMAL(15,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            tax_amount      DECIMAL(15,2) DEFAULT 0,
            note            TEXT,
            opened_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            billed_at       TIMESTAMPTZ,
            closed_at       TIMESTAMPTZ,
            created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_orders');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (status, opened_at);',
        'idx_' || v_prefix || '_rest_orders_status',
        v_prefix || '_rest_orders');

    -- -----------------------------------------------------------------------
    -- 5b. Rest Order Items (Sipariş Kalemleri)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id          UUID,            -- → {period}_rest_orders(id)
            product_id        UUID,            -- → {firm}_products(id)
            product_name      VARCHAR(255) NOT NULL,
            quantity          DECIMAL(15,3)   NOT NULL DEFAULT 1,
            unit_price        DECIMAL(15,2)   NOT NULL,
            discount_pct      DECIMAL(5,2)    DEFAULT 0,
            subtotal          DECIMAL(15,2)   NOT NULL,
            status            VARCHAR(20)     DEFAULT ''pending'',
                                              -- pending | cooking | ready | served | cancelled
            course            VARCHAR(50),    -- başlangıç | ara sıcak | ana yemek | tatlı | içecek
            note              TEXT,
            is_complimentary  BOOLEAN         DEFAULT false,
            sent_to_kitchen_at TIMESTAMPTZ,
            served_at         TIMESTAMPTZ,
            created_at        TIMESTAMPTZ     DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_order_items');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (order_id);',
        'idx_' || v_prefix || '_rest_order_items_order',
        v_prefix || '_rest_order_items');

    -- -----------------------------------------------------------------------
    -- 5c. Rest Kitchen Orders (Mutfak Fişleri)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id     UUID,             -- → {period}_rest_orders(id)
            table_number VARCHAR(50),
            floor_name   VARCHAR(100),
            waiter       VARCHAR(255),
            status       VARCHAR(20)  DEFAULT ''new'',
                                          -- new | cooking | ready | served
            priority     INTEGER      DEFAULT 0,
            note         TEXT,
            sent_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            cooked_at    TIMESTAMPTZ,
            served_at    TIMESTAMPTZ,
            created_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_kitchen_orders');

    -- -----------------------------------------------------------------------
    -- 5d. Rest Kitchen Items (Mutfak Fişi Kalemleri)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            kitchen_order_id  UUID,         -- → {period}_rest_kitchen_orders(id)
            order_item_id     UUID,         -- → {period}_rest_order_items(id)
            product_name      VARCHAR(255) NOT NULL,
            quantity          DECIMAL(15,3) NOT NULL,
            course            VARCHAR(50),
            note              TEXT,
            status            VARCHAR(20) DEFAULT ''new''
        );
    ', v_prefix || '_rest_kitchen_items');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (kitchen_order_id);',
        'idx_' || v_prefix || '_rest_kitchen_items_order',
        v_prefix || '_rest_kitchen_items');

    RAISE NOTICE 'Restaurant period tables created for %_%', p_firm_nr, p_period_nr;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 6. INIT_RESTAURANT_FIRM_TABLES(firmNr)
--    Creates / ensures firm-specific restaurant card tables.
--    (rest_tables, rest_recipes, rest_recipe_ingredients are already in
--     CREATE_FIRM_TABLES, but this function can be called explicitly to
--     ensure they exist when restaurant mode is activated later.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION INIT_RESTAURANT_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix TEXT;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Masa tanımları (firm bazlı)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            floor_id        UUID,           -- → rest.floors(id)
            number          VARCHAR(50)  NOT NULL,
            seats           INTEGER      DEFAULT 4,
            status          VARCHAR(20)  DEFAULT ''empty'',
            waiter          VARCHAR(255),
            start_time      TIMESTAMPTZ,
            last_order_time TIMESTAMPTZ,
            total           DECIMAL(15,2) DEFAULT 0,
            is_large        BOOLEAN      DEFAULT false,
            pos_x           INTEGER      DEFAULT 0,
            pos_y           INTEGER      DEFAULT 0,
            created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_tables');

    -- Reçeteler (firm bazlı — products tablosundan bağımsız)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            menu_item_id    UUID,           -- → {firm}_products(id)
            total_cost      DECIMAL(15,2)  DEFAULT 0,
            wastage_percent DECIMAL(5,2)   DEFAULT 0,
            is_active       BOOLEAN        DEFAULT true,
            created_at      TIMESTAMPTZ    DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ    DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_recipes');

    -- Reçete bileşenleri (firm bazlı)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            recipe_id   UUID,             -- → {firm}_rest_recipes(id)
            material_id UUID,             -- → {firm}_products(id)
            quantity    DECIMAL(15,3)   NOT NULL DEFAULT 1,
            unit        VARCHAR(20),
            cost        DECIMAL(15,2)   DEFAULT 0,
            created_at  TIMESTAMPTZ     DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_recipe_ingredients');

    RAISE NOTICE 'Restaurant firm tables ensured for %', p_firm_nr;
END;
$$ LANGUAGE plpgsql;
