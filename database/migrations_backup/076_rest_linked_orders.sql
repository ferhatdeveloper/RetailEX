-- Migration 076: Add linked_order_ids to rest_tables for table merging with separate fatura codes
-- Purpose: Allows tables to be merged while each table keeps its own invoice (fatura) code.
--          At payment time, all linked orders are closed together.
--
-- Also adds missing columns (waiter, staff_id, start_time, locked_*) for fresh installs
-- that may have missed earlier partial migrations, and updates INIT_RESTAURANT_FIRM_TABLES.

-- ─── 1. Var olan tüm firmaların rest_tables tablolarına sütunları ekle ─────────────────────────
DO $$
DECLARE
    r RECORD;
    v_prefix TEXT;
    v_table  TEXT;
BEGIN
    FOR r IN SELECT firm_nr FROM public.firms LOOP
        v_prefix := lower('rex_' || r.firm_nr);
        v_table  := v_prefix || '_rest_tables';

        -- linked_order_ids (yeni) — masa birleştirme fatura takibi
        EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS linked_order_ids text[] DEFAULT ''{}''', v_table);

        -- Diğer sütunlar (önceki migrationlarda eklenmemiş olabilir)
        EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS waiter VARCHAR(255)', v_table);
        EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS staff_id UUID', v_table);
        EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ', v_table);
        EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS locked_by_staff_id UUID', v_table);
        EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS locked_by_staff_name VARCHAR(255)', v_table);
        EXECUTE format('ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ', v_table);

        RAISE NOTICE 'Updated rest.% — linked_order_ids added', v_table;
    END LOOP;
END $$;

-- ─── 2. INIT_RESTAURANT_FIRM_TABLES güncelle (yeni firma kurulumu için) ──────────────────────────
CREATE OR REPLACE FUNCTION INIT_RESTAURANT_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
    -- 2.1 Restaurant Tables (Card)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            floor_id              UUID REFERENCES rest.floors(id),
            number                VARCHAR(50)  NOT NULL,
            seats                 INTEGER      DEFAULT 4,
            status                VARCHAR(20)  DEFAULT ''empty'',
            total                 DECIMAL(15,2) DEFAULT 0,
            pos_x                 INTEGER      DEFAULT 0,
            pos_y                 INTEGER      DEFAULT 0,
            is_large              BOOLEAN      DEFAULT false,
            waiter                VARCHAR(255),
            staff_id              UUID,
            start_time            TIMESTAMPTZ,
            locked_by_staff_id    UUID,
            locked_by_staff_name  VARCHAR(255),
            locked_at             TIMESTAMPTZ,
            linked_order_ids      text[]       DEFAULT ''{}'',
            updated_at            TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_tables');

    EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), menu_item_id UUID, total_cost DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true);', v_prefix || '_rest_recipes');
    EXECUTE format('CREATE TABLE IF NOT EXISTS rest.%I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), recipe_id UUID REFERENCES rest.%I(id), material_id UUID, quantity DECIMAL(15,3), unit VARCHAR(20));', v_prefix || '_rest_recipe_ingredients', v_prefix || '_rest_recipes');

    -- Staff (Phase 3)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS rest.%I (
            id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name       VARCHAR(100) NOT NULL,
            role       VARCHAR(50)  DEFAULT ''Waiter'',
            pin        VARCHAR(10)  NOT NULL UNIQUE,
            is_active  BOOLEAN      DEFAULT true,
            created_at TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_rest_staff');
END;
$$ LANGUAGE plpgsql;
