-- Migration: 037_exchange_rate_infrastructure.sql
-- Description: Infrastructure for real-time IQD/USD currency management.
-- Synchronizes rates from Logo to all RetailEX terminals.

-- 1. Create Exchange Rates table in public schema
CREATE TABLE IF NOT EXISTS public.exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency_code VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    buy_rate DECIMAL(18,8) NOT NULL,
    sell_rate DECIMAL(18,8) NOT NULL,
    effective_buy DECIMAL(18,8),
    effective_sell DECIMAL(18,8),
    source VARCHAR(50) DEFAULT 'Logo',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(currency_code, date, source)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON public.exchange_rates(date DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_code ON public.exchange_rates(currency_code);

-- 2. Notify function for real-time broadcast
-- This sends a NOTIFY signal that the sync-service can listen to
CREATE OR REPLACE FUNCTION public.notify_exchange_rate_update()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'exchange_rate_update',
        json_build_object(
            'currency_code', NEW.currency_code,
            'buy_rate', NEW.buy_rate,
            'sell_rate', NEW.sell_rate,
            'date', NEW.date
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exchange_rate_update ON public.exchange_rates;
CREATE TRIGGER trg_exchange_rate_update
AFTER INSERT OR UPDATE ON public.exchange_rates
FOR EACH ROW EXECUTE FUNCTION public.notify_exchange_rate_update();

-- 3. Ensure the base currencies exist in the master table if not already there
INSERT INTO public.currencies (code, name, symbol, is_base_currency, is_active)
VALUES 
    ('IQD', 'Iraqi Dinar', 'د.ع', true, true),
    ('USD', 'US Dollar', '$', false, true),
    ('EUR', 'Euro', '€', false, true)
ON CONFLICT (code) DO UPDATE SET is_active = true;
