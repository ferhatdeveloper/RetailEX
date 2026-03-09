-- Migration 077: Add payment_method to rest_orders for Z-Report aggregation
-- Also updates INIT_RESTAURANT_PERIOD_TABLES_V2 to include payment_method

-- ─── 1. Add payment_method to all existing rest_orders tables ────────────────
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'rest'
          AND table_name LIKE '%_rest_orders'
    LOOP
        EXECUTE format(
            'ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)',
            r.table_name
        );
        RAISE NOTICE 'Updated rest.% — payment_method added', r.table_name;
    END LOOP;
END $$;

-- ─── 2. Update INIT_RESTAURANT_PERIOD_TABLES_V2 ──────────────────────────────
CREATE OR REPLACE FUNCTION INIT_RESTAURANT_PERIOD_TABLES_V2(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
    -- Rest Orders
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_no        VARCHAR(50) UNIQUE,
            table_id        UUID,
            floor_id        UUID REFERENCES rest.floors(id),
            waiter          VARCHAR(255),
            customer_id     UUID,
            status          VARCHAR(20)  DEFAULT ''open'',
            total_amount    DECIMAL(15,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            tax_amount      DECIMAL(15,2) DEFAULT 0,
            payment_method  VARCHAR(50),
            note            TEXT,
            parent_order_id UUID,
            opened_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            billed_at       TIMESTAMPTZ,
            closed_at       TIMESTAMPTZ,
            created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_orders');

    -- Rest Order Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id           UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            product_id         UUID,
            product_name       VARCHAR(255) NOT NULL,
            quantity           DECIMAL(15,3)  NOT NULL DEFAULT 1,
            unit_price         DECIMAL(15,2)  NOT NULL,
            discount_pct       DECIMAL(5,2)   DEFAULT 0,
            subtotal           DECIMAL(15,2)  NOT NULL,
            status             VARCHAR(20)    DEFAULT ''pending'',
            course             VARCHAR(50),
            note               TEXT,
            options            JSONB,
            is_void            BOOLEAN        DEFAULT false,
            void_reason        TEXT,
            is_complementary   BOOLEAN        DEFAULT false,
            sent_to_kitchen_at TIMESTAMPTZ,
            served_at          TIMESTAMPTZ,
            created_at         TIMESTAMPTZ    DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_order_items', v_prefix || '_rest_orders');

    -- Kitchen Orders
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id     UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            table_number VARCHAR(50),
            waiter       VARCHAR(255),
            status       VARCHAR(20)  DEFAULT ''new'',
            note         TEXT,
            kitchen_note TEXT,
            sent_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_orders');

    -- Kitchen Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            kitchen_order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            order_item_id   UUID REFERENCES rest.%I(id),
            product_name    VARCHAR(255),
            quantity        DECIMAL(15,3),
            course          VARCHAR(50),
            note            TEXT,
            status          VARCHAR(20)  DEFAULT ''new''
        );
    ', v_prefix || '_rest_kitchen_items',
       v_prefix || '_rest_kitchen_orders',
       v_prefix || '_rest_order_items');

    -- Reservations
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            customer_id      UUID,
            customer_name    VARCHAR(255) NOT NULL,
            phone            VARCHAR(50),
            reservation_date DATE NOT NULL,
            reservation_time TIME NOT NULL,
            guest_count      INTEGER DEFAULT 2,
            table_id         UUID,
            table_name       VARCHAR(50),
            status           VARCHAR(20) DEFAULT ''pending'',
            note             TEXT,
            created_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_reservations');
END;
$$ LANGUAGE plpgsql;
