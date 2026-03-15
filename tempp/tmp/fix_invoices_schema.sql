-- Add credit_amount to sales table (period-based)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rex_001_01_sales' AND column_name = 'credit_amount') THEN
        ALTER TABLE rex_001_01_sales ADD COLUMN credit_amount numeric DEFAULT 0;
    END IF;
END $$;
