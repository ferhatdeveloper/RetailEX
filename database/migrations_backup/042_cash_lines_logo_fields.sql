-- Add Logo ERP fields to Cash Lines
-- Created: 2026-02-17
-- Description: Adds columns for Logo integration (Customer link, Currency, Status)

DO $$
DECLARE
    v_target_table text := 'rex_009_01_cash_lines';
BEGIN
    -- Check if table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rex_009_01_cash_lines' AND table_schema = 'public') THEN
        
        -- Add customer_id (UUID)
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'customer_id') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN customer_id UUID;
            RAISE NOTICE 'Added customer_id column';
        END IF;

        -- Add currency_code
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'currency_code') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN currency_code VARCHAR(10) DEFAULT 'YEREL';
            RAISE NOTICE 'Added currency_code column';
        END IF;

         -- Add exchange_rate
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'exchange_rate') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN exchange_rate DECIMAL(10,4) DEFAULT 1;
            RAISE NOTICE 'Added exchange_rate column';
        END IF;

        -- Add f_amount (Foreign Amount)
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'f_amount') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN f_amount DECIMAL(15,2) DEFAULT 0;
            RAISE NOTICE 'Added f_amount column';
        END IF;

        -- Add transfer_status (0: Pending, 1: Transferred, 2: Error)
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'transfer_status') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN transfer_status INTEGER DEFAULT 0;
            RAISE NOTICE 'Added transfer_status column';
        END IF;

        -- Add logo_ref (Link to Logo L_KSLINES)
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'logo_ref') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN logo_ref INTEGER;
            RAISE NOTICE 'Added logo_ref column';
        END IF;

         -- Add special_code (For grouping)
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_009_01_cash_lines' AND column_name = 'special_code') THEN
            ALTER TABLE public.rex_009_01_cash_lines ADD COLUMN special_code VARCHAR(50);
            RAISE NOTICE 'Added special_code column';
        END IF;

    ELSE
        RAISE NOTICE 'Table rex_009_01_cash_lines does not exist (Skipping)';
    END IF;
END $$;
