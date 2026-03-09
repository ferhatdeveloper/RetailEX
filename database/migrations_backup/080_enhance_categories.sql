-- 080_enhance_categories.sql
-- Add restaurant flag and icon to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_restaurant BOOLEAN DEFAULT false;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(100);
