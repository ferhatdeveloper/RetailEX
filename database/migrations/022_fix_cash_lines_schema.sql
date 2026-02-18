-- Fix Cash Lines Schema for Firm 009 Period 01
-- Created: 2026-02-14
-- Description: Adds missing columns to rex_009_01_cash_lines to support modern transaction logic

DO $$
BEGIN
    -- Check if table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rex_009_01_cash_lines' AND table_schema = 'public') THEN
        
        -- Add register_id (UUID) if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'register_id') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN register_id UUID;
            RAISE NOTICE 'Added register_id column';
        END IF;

        -- Add transaction_type (VARCHAR) if missing
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'transaction_type') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN transaction_type VARCHAR(50);
            RAISE NOTICE 'Added transaction_type column';
        END IF;

    ELSE
        -- Create table if it doesn't exist (Backup plan)
        CREATE TABLE public.rex_009_01_cash_lines (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            register_id UUID, -- Link to cash register
            cash_ref INTEGER, -- Legacy link
            fiche_no VARCHAR(100),
            transaction_type VARCHAR(50), -- CH_TAHSILAT, CH_ODEME, etc.
            trcode INTEGER,
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            amount DECIMAL(15,2) DEFAULT 0,
            sign INTEGER DEFAULT 0, 
            customer_ref INTEGER,
            definition TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        RAISE NOTICE 'Created rex_009_01_cash_lines table';
    END IF;
END $$;
