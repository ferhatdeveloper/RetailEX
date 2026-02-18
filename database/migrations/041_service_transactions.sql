-- Service Transactions Table for Profit/Loss Tracking
-- Tracks external service top-ups (Fastlink, Korek, Zain)
-- Created: 2026-02-16

CREATE TABLE IF NOT EXISTS service_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    store_id UUID, -- Optional link to store
    
    transaction_type VARCHAR(20) NOT NULL, -- 'topup', 'bill_payment'
    provider VARCHAR(50) NOT NULL, -- 'fastlink', 'korek', 'zain', etc.
    target_number VARCHAR(50) NOT NULL, -- Phone number or account ID
    
    package_name VARCHAR(100), -- e.g. '10GB Data', '5000 IQD Credit'
    
    amount DECIMAL(15,2) NOT NULL, -- Sale Price (Satış Fiyatı)
    cost DECIMAL(15,2) DEFAULT 0, -- Buy Price (Alış Fiyatı / Maliyet)
    profit DECIMAL(15,2) GENERATED ALWAYS AS (amount - cost) STORED,
    currency VARCHAR(10) DEFAULT 'IQD',
    
    payment_method VARCHAR(50), -- 'cash', 'card', 'zaincash'
    status VARCHAR(20) DEFAULT 'completed',
    transaction_ref VARCHAR(100), -- External Reference ID
    
    sms_sent BOOLEAN DEFAULT false,
    staff_id UUID, -- Who performed the transaction
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for reporting
CREATE INDEX IF NOT EXISTS idx_service_transactions_firm ON service_transactions(firm_nr);
CREATE INDEX IF NOT EXISTS idx_service_transactions_date ON service_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_service_transactions_provider ON service_transactions(provider);
