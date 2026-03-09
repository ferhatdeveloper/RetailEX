-- Yeni mutfak alanlarını tüm dinamik (rex_xxx_xx_...) tablolara ve taslak fonksiyonlara ekleyen migration.

DO $$
DECLARE
    rec RECORD;
BEGIN
    -- 1. Mevcut tüm rex_%_rest_kitchen_orders tablolarına eksik kolonları ekle
    FOR rec IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'rest' AND table_name LIKE 'rex_%_rest_kitchen_orders'
    LOOP
        EXECUTE 'ALTER TABLE rest.' || rec.table_name || ' ADD COLUMN IF NOT EXISTS floor_name VARCHAR(100)';
        EXECUTE 'ALTER TABLE rest.' || rec.table_name || ' ADD COLUMN IF NOT EXISTS staff_id UUID';
        EXECUTE 'ALTER TABLE rest.' || rec.table_name || ' ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMP WITH TIME ZONE';
    END LOOP;

    -- 2. Mevcut tüm rex_%_rest_kitchen_items tablolarına eksik kolonları ekle
    FOR rec IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'rest' AND table_name LIKE 'rex_%_rest_kitchen_items'
    LOOP
        EXECUTE 'ALTER TABLE rest.' || rec.table_name || ' ADD COLUMN IF NOT EXISTS preparation_time INTEGER';
        EXECUTE 'ALTER TABLE rest.' || rec.table_name || ' ADD COLUMN IF NOT EXISTS start_at TIMESTAMP WITH TIME ZONE';
        EXECUTE 'ALTER TABLE rest.' || rec.table_name || ' ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMP WITH TIME ZONE';
    END LOOP;

END $$;
