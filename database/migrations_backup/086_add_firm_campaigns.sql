-- 086_add_firm_campaigns.sql
-- Adds the missing campaigns table to existing firms

DO $$ 
DECLARE
    r RECORD;
    v_tbl_campaigns TEXT;
BEGIN
    FOR r IN SELECT firm_nr FROM public.firms LOOP
        v_tbl_campaigns := 'rex_' || r.firm_nr || '_campaigns';
        
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS %I (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                firm_nr VARCHAR(10) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                type VARCHAR(50) NOT NULL,
                discount_type VARCHAR(50) NOT NULL,
                discount_value DECIMAL(15,2) DEFAULT 0,
                start_date TIMESTAMPTZ,
                end_date TIMESTAMPTZ,
                is_active BOOLEAN DEFAULT true,
                min_purchase_amount DECIMAL(15,2) DEFAULT 0,
                max_discount_amount DECIMAL(15,2),
                applicable_categories VARCHAR(255),
                applicable_products JSONB DEFAULT ''[]'',
                priority INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        ', v_tbl_campaigns);
        
        RAISE NOTICE 'Campaigns table checked/created for firm %', r.firm_nr;
    END LOOP;
END $$;
