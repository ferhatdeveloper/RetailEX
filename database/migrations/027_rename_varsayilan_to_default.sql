-- Migration: 027_rename_varsayilan_to_default.sql
-- Description: Renames 'varsayilan' to 'default' OR adds 'default' if neither exists.
-- Quoted as "default" because it's a reserved word in PG.

DO $$
BEGIN
    -- 1. FIRMS Table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'firms' AND column_name = 'varsayilan') THEN
        ALTER TABLE firms RENAME COLUMN varsayilan TO "default";
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'firms' AND column_name = 'default') THEN
        ALTER TABLE firms ADD COLUMN "default" BOOLEAN DEFAULT false;
    END IF;

    -- 2. PERIODS Table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'periods' AND column_name = 'varsayilan') THEN
        ALTER TABLE periods RENAME COLUMN varsayilan TO "default";
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'periods' AND column_name = 'default') THEN
        ALTER TABLE periods ADD COLUMN "default" BOOLEAN DEFAULT false;
    END IF;

    -- 3. STORES Table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'varsayilan') THEN
        ALTER TABLE stores RENAME COLUMN varsayilan TO "default";
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'default') THEN
        ALTER TABLE stores ADD COLUMN "default" BOOLEAN DEFAULT false;
    END IF;
END $$;
