-- ============================================================================
-- Migration 073: Virman Operations - Add to existing firm/period tables
-- Applies virman tables to already-created firm+period combinations.
-- New setups: CREATE_PERIOD_TABLES in 002_core_logic.sql handles this automatically.
-- ============================================================================

-- Apply for all existing firm+period table combinations
DO $$
DECLARE
    r RECORD;
    v_prefix TEXT;
    v_ops_table TEXT;
    v_items_table TEXT;
BEGIN
    -- Detect existing rex_{firm}_{period}_sales tables to find all firm/period combos
    FOR r IN
        SELECT
            split_part(table_name, '_', 2) AS firm_nr,
            split_part(table_name, '_', 3) AS period_nr
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name ~ '^rex_[0-9]+_[0-9]+_sales$'
    LOOP
        v_prefix := 'rex_' || r.firm_nr || '_' || r.period_nr;
        v_ops_table   := v_prefix || '_virman_operations';
        v_items_table := v_prefix || '_virman_items';

        -- Create virman_operations if not exists
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                firm_nr VARCHAR(10) NOT NULL,
                period_nr VARCHAR(10),
                virman_no VARCHAR(100) NOT NULL,
                from_warehouse_id UUID,
                to_warehouse_id UUID,
                operation_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT ''draft'',
                notes TEXT,
                created_by VARCHAR(100),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        ', v_ops_table);

        -- Create virman_items if not exists
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                virman_id UUID REFERENCES %I(id) ON DELETE CASCADE,
                product_id UUID,
                quantity DECIMAL(15,4) DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        ', v_items_table, v_ops_table);

        RAISE NOTICE 'Virman tables created for: %', v_prefix;
    END LOOP;
END $$;
