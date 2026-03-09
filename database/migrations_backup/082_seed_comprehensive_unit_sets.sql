-- 082_seed_comprehensive_unit_sets.sql
-- Force parity for Firm 001 and ensure unique constraint exists

DO $$ 
BEGIN
    -- Add unique constraint if missing for rex_001_unitsetl
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rex_001_unitsetl') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rex_001_unitsetl_unitset_id_item_code_key') THEN
            ALTER TABLE rex_001_unitsetl ADD CONSTRAINT rex_001_unitsetl_unitset_id_item_code_key UNIQUE(unitset_id, item_code);
        END IF;
    END IF;
END $$;

-- 1. Base Units Global
INSERT INTO units (code, name) VALUES 
('GRAM', 'Gram'),
('ML', 'Militre')
ON CONFLICT (code) DO NOTHING;

-- 2. Seed Firm 001
DO $$ 
DECLARE
    v_unitset_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rex_001_unitsets') THEN
        -- ADET SET
        INSERT INTO rex_001_unitsets (code, name) VALUES ('01-ADET', 'Adet Varsayılan') 
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_unitset_id;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'ADET', 1) ON CONFLICT DO NOTHING;

        -- KG SET
        INSERT INTO rex_001_unitsets (code, name) VALUES ('02-KG', 'Kilogram/Gram') 
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_unitset_id;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'KG', 1) ON CONFLICT DO NOTHING;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'GRAM', 1000) ON CONFLICT DO NOTHING;

        -- LT SET
        INSERT INTO rex_001_unitsets (code, name) VALUES ('03-LT', 'Litre/Militre') 
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_unitset_id;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'LT', 1) ON CONFLICT DO NOTHING;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'ML', 1000) ON CONFLICT DO NOTHING;

        -- KOLI 24
        INSERT INTO rex_001_unitsets (code, name) VALUES ('04-KOLI24', 'Koli (24 Adet)') 
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_unitset_id;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'KOLI', 1) ON CONFLICT DO NOTHING;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'ADET', 24) ON CONFLICT DO NOTHING;

        -- PKT 10
        INSERT INTO rex_001_unitsets (code, name) VALUES ('05-PKT10', 'Paket (10 Adet)') 
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_unitset_id;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'PKT', 1) ON CONFLICT DO NOTHING;
        INSERT INTO rex_001_unitsetl (unitset_id, item_code, conv_fact1) VALUES (v_unitset_id, 'ADET', 10) ON CONFLICT DO NOTHING;
    END IF;
END $$;
