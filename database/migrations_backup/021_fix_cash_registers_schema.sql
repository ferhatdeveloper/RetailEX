-- Fix Cash Registers Schema for Firm 009
-- Created: 2026-02-14
-- Description: Adds missing columns to rex_009_cash_registers if they don't exist

DO $$
BEGIN
    -- Check if table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rex_009_cash_registers' AND table_schema = 'public') THEN
        
        -- Add is_active if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_cash_registers' AND column_name = 'is_active') THEN
            ALTER TABLE public.rex_009_cash_registers ADD COLUMN is_active BOOLEAN DEFAULT true;
            RAISE NOTICE 'Added is_active column';
        END IF;

        -- Add other potentially missing columns based on screenshot
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_cash_registers' AND column_name = 'currency_code') THEN
            ALTER TABLE public.rex_009_cash_registers ADD COLUMN currency_code VARCHAR(10) DEFAULT 'IQD';
             RAISE NOTICE 'Added currency_code column';
        END IF;

    END IF;
END $$;
