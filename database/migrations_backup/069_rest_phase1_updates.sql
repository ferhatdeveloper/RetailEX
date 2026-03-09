-- Phase 1: Restaurant Module Enhancements
-- 1. Add Support for Split Orders and Structured Modifiers

-- Add parent_order_id to track split orders
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'rest' AND column_name = 'parent_order_id'
        AND table_name LIKE '%_rest_orders'
    ) THEN
        -- This logic is tricky because of dynamic table names in the current system.
        -- We will apply it to the base schema or common pattern if needed, 
        -- but the system uses lex_firmNr_periodNr_rest_orders.
        -- For now, we'll add it to the 'rest' schema if there's a template or just handle it in the INIT function.
        NULL;
    END IF;
END $$;

-- Update the INIT_RESTAURANT_PERIOD_TABLES function to include new columns
CREATE OR REPLACE FUNCTION INIT_RESTAURANT_PERIOD_TABLES_V2(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr || '_' || p_period_nr);
BEGIN
    -- 2.3 Rest Orders (Enhanced)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_no        VARCHAR(50) UNIQUE,
            table_id        UUID,
            floor_id        UUID REFERENCES rest.floors(id),    
            waiter          VARCHAR(255),
            customer_id     UUID,
            status          VARCHAR(20) DEFAULT ''open'',       
            total_amount    DECIMAL(15,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            tax_amount      DECIMAL(15,2) DEFAULT 0,
            note            TEXT,
            parent_order_id UUID, -- For Split Billing
            opened_at       TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            billed_at       TIMESTAMPTZ,
            closed_at       TIMESTAMPTZ,
            created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_orders');

    -- 2.4 Rest Order Items (Enhanced)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            order_id          UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            product_id        UUID,
            product_name      VARCHAR(255) NOT NULL,
            quantity          DECIMAL(15,3)   NOT NULL DEFAULT 1,
            unit_price        DECIMAL(15,2)   NOT NULL,
            discount_pct      DECIMAL(5,2)    DEFAULT 0,        
            subtotal          DECIMAL(15,2)   NOT NULL,
            status            VARCHAR(20)     DEFAULT ''pending'',
            course            VARCHAR(50),
            note              TEXT,
            options           JSONB, -- Structured modifiers/options
            is_complimentary  BOOLEAN         DEFAULT false,    
            sent_to_kitchen_at TIMESTAMPTZ,
            created_at        TIMESTAMPTZ     DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_order_items', v_prefix || '_rest_orders');

    -- (Other tables remain same but we ensure function is updated)
    -- 2.5 Kitchen Queue
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),     
            order_id UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            table_number VARCHAR(50),
            waiter VARCHAR(255),
            status VARCHAR(20) DEFAULT ''new'', 
            note TEXT,
            sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP       
        );
    ', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_orders');

    -- 2.6 Kitchen Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            kitchen_order_id  UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            order_item_id     UUID REFERENCES rest.%I(id) ON DELETE CASCADE,
            product_name      VARCHAR(255) NOT NULL,
            quantity          DECIMAL(15,3) NOT NULL,
            course            VARCHAR(50),
            note              TEXT,
            status            VARCHAR(20) DEFAULT ''new''       
        );
    ', v_prefix || '_rest_kitchen_items', v_prefix || '_rest_kitchen_orders', v_prefix || '_rest_order_items');
END;
$$ LANGUAGE plpgsql;

-- Apply to existing tables (Standard firm 001, period 01 for dev)
SELECT INIT_RESTAURANT_PERIOD_TABLES_V2('001', '01');
