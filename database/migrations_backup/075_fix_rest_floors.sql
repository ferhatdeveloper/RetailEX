-- Migration 075: Fix rest.floors missing columns + make store_id nullable
-- Problem: rest.floors is missing is_active and updated_at columns
-- Also: store_id FK constraint prevents inserts when no store UUID is registered

-- Add missing columns
ALTER TABLE rest.floors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE rest.floors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Make store_id nullable (foreign key stays but allows NULL for unregistered devices)
ALTER TABLE rest.floors ALTER COLUMN store_id DROP NOT NULL;
