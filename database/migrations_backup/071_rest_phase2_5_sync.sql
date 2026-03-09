-- Phase 2.5: Kitchen Timing & Sync (REFINED)

-- 1. Add preparation_time to products (in minutes)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preparation_time INTEGER DEFAULT 5;

-- 2. Add timing fields to KITCHEN ITEMS
-- Note: Current dev system uses rex_001_01_ prefix but code often refers to them without prefix via search_path or views.
-- We will add columns to the 'rest' template if it exists, or common tables.
ALTER TABLE rest.rest_kitchen_items ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rest.rest_kitchen_items ADD COLUMN IF NOT EXISTS start_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE rest.rest_kitchen_items ADD COLUMN IF NOT EXISTS preparation_time INTEGER;

-- 3. Add estimated_ready_at to KITCHEN ORDERS (overall)
ALTER TABLE rest.rest_kitchen_orders ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMP WITH TIME ZONE;

-- 4. Update existing products with some defaults for testing
UPDATE public.products SET preparation_time = 15 WHERE category ilike '%Ana Yemek%' OR category ilike '%Main%';
UPDATE public.products SET preparation_time = 20 WHERE category ilike '%Izgara%' OR category ilike '%Grill%';
UPDATE public.products SET preparation_time = 7 WHERE category ilike '%Ara Sıcak%' OR category ilike '%Starter%';
UPDATE public.products SET preparation_time = 3 WHERE category ilike '%İçecek%' OR category ilike '%Drink%';
