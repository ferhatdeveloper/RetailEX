-- ============================================================================
-- RetailEx - RESTAURANT SCHEMA FIX (Migration 057)
-- ----------------------------------------------------------------------------
-- Problem:
--   CREATE_PERIOD_TABLES (002_logic.sql) creates rest_orders / rest_order_items
--   with the OLD column structure (waiter_id, price, menu_item_id, etc.).
--   INIT_RESTAURANT_PERIOD_TABLES then uses CREATE TABLE IF NOT EXISTS which
--   skips already-created tables → service queries fail on missing columns.
--
-- Fix:
--   1. ALTER existing *_rest_orders tables → add all missing columns
--   2. ALTER existing *_rest_order_items tables → add all missing columns
--   3. Ensure *_rest_kitchen_orders / *_rest_kitchen_items exist for all
--      existing restaurant period tables (in case INIT_ was never called)
--   4. Replace INIT_RESTAURANT_PERIOD_TABLES with a version that also
--      ALTERs existing tables → safe for future setups too
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add missing columns to every existing _rest_orders table
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_rest_orders'
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS order_no        VARCHAR(50)',                   tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS floor_id        UUID',                         tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS waiter          VARCHAR(255)',                  tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(15,2) DEFAULT 0',      tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tax_amount      DECIMAL(15,2) DEFAULT 0',      tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS note            TEXT',                         tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS opened_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS billed_at       TIMESTAMPTZ',                  tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ',                  tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', tbl);
            RAISE NOTICE 'rest_orders fixed: %', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not fix rest_orders table %: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Add missing columns to every existing _rest_order_items table
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_rest_order_items'
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS product_id         UUID',                     tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS product_name       VARCHAR(255)',             tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit_price         DECIMAL(15,2) DEFAULT 0', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS discount_pct       DECIMAL(5,2)  DEFAULT 0', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS subtotal           DECIMAL(15,2) DEFAULT 0', tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS course             VARCHAR(50)',              tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS note               TEXT',                    tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_complimentary   BOOLEAN DEFAULT false',   tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS sent_to_kitchen_at TIMESTAMPTZ',             tbl);
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS served_at          TIMESTAMPTZ',             tbl);
            RAISE NOTICE 'rest_order_items fixed: %', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not fix rest_order_items table %: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Ensure kitchen tables exist for all existing rest_orders tables
--    (In case INIT_RESTAURANT_PERIOD_TABLES was never called or failed)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl       TEXT;
    v_prefix  TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_name   LIKE '%_rest_orders'
    LOOP
        -- Derive prefix: strip trailing '_rest_orders'
        v_prefix := substring(tbl FROM 1 FOR length(tbl) - length('_rest_orders'));

        BEGIN
            -- rest_kitchen_orders
            EXECUTE format('
                CREATE TABLE IF NOT EXISTS %I (
                    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    order_id     UUID,
                    table_number VARCHAR(50),
                    floor_name   VARCHAR(100),
                    waiter       VARCHAR(255),
                    status       VARCHAR(20)  DEFAULT ''new'',
                    priority     INTEGER      DEFAULT 0,
                    note         TEXT,
                    sent_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
                    cooked_at    TIMESTAMPTZ,
                    served_at    TIMESTAMPTZ,
                    created_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
                    updated_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
                )
            ', v_prefix || '_rest_kitchen_orders');

            -- rest_kitchen_items
            EXECUTE format('
                CREATE TABLE IF NOT EXISTS %I (
                    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    kitchen_order_id UUID,
                    order_item_id    UUID,
                    product_name     VARCHAR(255) NOT NULL,
                    quantity         DECIMAL(15,3) NOT NULL DEFAULT 1,
                    course           VARCHAR(50),
                    note             TEXT,
                    status           VARCHAR(20) DEFAULT ''new''
                )
            ', v_prefix || '_rest_kitchen_items');

            RAISE NOTICE 'Kitchen tables ensured for prefix: %', v_prefix;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not create kitchen tables for %: %', v_prefix, SQLERRM;
        END;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Replace INIT_RESTAURANT_PERIOD_TABLES with ALTER-aware version
--    This makes future wizard setups safe even if CREATE_PERIOD_TABLES
--    already created rest_orders with old schema.
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
    -- rest_orders: create if missing, then ensure all columns exist
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_no        VARCHAR(50) UNIQUE,
            table_id        UUID,
            floor_id        UUID,
            waiter          VARCHAR(255),
            customer_id     UUID,
            status          VARCHAR(20) DEFAULT ''open'',
            total_amount    DECIMAL(15,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            tax_amount      DECIMAL(15,2) DEFAULT 0,
            note            TEXT,
            opened_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            billed_at       TIMESTAMPTZ,
            closed_at       TIMESTAMPTZ,
            created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_rest_orders');

    -- ADD COLUMN IF NOT EXISTS for tables created by old CREATE_PERIOD_TABLES
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS order_no        VARCHAR(50)',                           v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS floor_id        UUID',                                 v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS waiter          VARCHAR(255)',                         v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(15,2) DEFAULT 0',             v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tax_amount      DECIMAL(15,2) DEFAULT 0',             v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS note            TEXT',                                 v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS opened_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS billed_at       TIMESTAMPTZ',                         v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ',                         v_prefix || '_rest_orders');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP', v_prefix || '_rest_orders');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (status, opened_at)',
        'idx_' || v_prefix || '_rest_orders_status', v_prefix || '_rest_orders');

    -- -----------------------------------------------------------------------
    -- rest_order_items: create if missing, then ensure all columns exist
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id          UUID,
            product_id        UUID,
            product_name      VARCHAR(255) NOT NULL DEFAULT '''',
            quantity          DECIMAL(15,3) NOT NULL DEFAULT 1,
            unit_price        DECIMAL(15,2) NOT NULL DEFAULT 0,
            discount_pct      DECIMAL(5,2)  DEFAULT 0,
            subtotal          DECIMAL(15,2) NOT NULL DEFAULT 0,
            status            VARCHAR(20)   DEFAULT ''pending'',
            course            VARCHAR(50),
            note              TEXT,
            is_complimentary  BOOLEAN       DEFAULT false,
            sent_to_kitchen_at TIMESTAMPTZ,
            served_at         TIMESTAMPTZ,
            created_at        TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_rest_order_items');

    -- ADD COLUMN IF NOT EXISTS for existing old-schema tables
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS product_id         UUID',                     v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS product_name       VARCHAR(255)',             v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit_price         DECIMAL(15,2) DEFAULT 0', v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS discount_pct       DECIMAL(5,2)  DEFAULT 0', v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS subtotal           DECIMAL(15,2) DEFAULT 0', v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS course             VARCHAR(50)',              v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS note               TEXT',                    v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_complimentary   BOOLEAN DEFAULT false',   v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS sent_to_kitchen_at TIMESTAMPTZ',             v_prefix || '_rest_order_items');
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS served_at          TIMESTAMPTZ',             v_prefix || '_rest_order_items');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (order_id)',
        'idx_' || v_prefix || '_rest_order_items_order', v_prefix || '_rest_order_items');

    -- -----------------------------------------------------------------------
    -- rest_kitchen_orders (new table — always safe)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id     UUID,
            table_number VARCHAR(50),
            floor_name   VARCHAR(100),
            waiter       VARCHAR(255),
            status       VARCHAR(20)  DEFAULT ''new'',
            priority     INTEGER      DEFAULT 0,
            note         TEXT,
            sent_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            cooked_at    TIMESTAMPTZ,
            served_at    TIMESTAMPTZ,
            created_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at   TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        )
    ', v_prefix || '_rest_kitchen_orders');

    -- -----------------------------------------------------------------------
    -- rest_kitchen_items (new table — always safe)
    -- -----------------------------------------------------------------------
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            kitchen_order_id UUID,
            order_item_id    UUID,
            product_name     VARCHAR(255) NOT NULL,
            quantity         DECIMAL(15,3) NOT NULL DEFAULT 1,
            course           VARCHAR(50),
            note             TEXT,
            status           VARCHAR(20) DEFAULT ''new''
        )
    ', v_prefix || '_rest_kitchen_items');

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (kitchen_order_id)',
        'idx_' || v_prefix || '_rest_kitchen_items_order', v_prefix || '_rest_kitchen_items');

    RAISE NOTICE 'Restaurant period tables fixed/created for %_%', p_firm_nr, p_period_nr;
END;
$$ LANGUAGE plpgsql;
