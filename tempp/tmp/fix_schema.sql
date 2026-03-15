-- Fix rex_001_products
ALTER TABLE rex_001_products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT FALSE;
ALTER TABLE rex_001_products ADD COLUMN IF NOT EXISTS hasvariants BOOLEAN DEFAULT FALSE; -- Some parts of code might use this

-- Fix rex_001_unitsetl
ALTER TABLE rex_001_unitsetl ADD COLUMN IF NOT EXISTS code VARCHAR;
ALTER TABLE rex_001_unitsetl ADD COLUMN IF NOT EXISTS name VARCHAR;
ALTER TABLE rex_001_unitsetl ADD COLUMN IF NOT EXISTS multiplier1 NUMERIC DEFAULT 1;
ALTER TABLE rex_001_unitsetl ADD COLUMN IF NOT EXISTS multiplier2 NUMERIC DEFAULT 1;
ALTER TABLE rex_001_unitsetl ADD COLUMN IF NOT EXISTS main_unit BOOLEAN DEFAULT FALSE;

-- Ensure consistency with existing columns if needed
UPDATE rex_001_unitsetl SET code = item_code WHERE code IS NULL AND item_code IS NOT NULL;
UPDATE rex_001_unitsetl SET multiplier1 = conv_fact1 WHERE multiplier1 = 1 AND conv_fact1 IS NOT NULL;
