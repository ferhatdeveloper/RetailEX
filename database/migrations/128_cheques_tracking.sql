-- ============================================================================
-- 128 — Çek / Senet Takibi (Cheque Tracking)
-- ============================================================================
-- Per-firma kart tablosu; çek/senet varlıklarını izler (vade, tutar, cari, durum).
-- Tablo `rex_${firmNr}_cheques` (period-prefix YOK) → `getCardTableName('cheques')`.
-- IRAK — KDV yok; vergi/kdv alanı eklenmedi.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rex_001_cheques (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_nr TEXT NOT NULL,
    period_nr TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cek', 'senet')),
    cari_type TEXT NOT NULL CHECK (cari_type IN ('customer', 'supplier')),
    cari_id TEXT NOT NULL,
    cari_name TEXT,
    amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'IQD',
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'collected', 'endorsed', 'bounced', 'protested')),
    bank_name TEXT,
    serial_no TEXT,
    document_no TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    closed_at TIMESTAMPTZ,
    closed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_rex_001_cheques_due_date
    ON rex_001_cheques (due_date);
CREATE INDEX IF NOT EXISTS idx_rex_001_cheques_status
    ON rex_001_cheques (status);
CREATE INDEX IF NOT EXISTS idx_rex_001_cheques_cari
    ON rex_001_cheques (cari_type, cari_id);
CREATE INDEX IF NOT EXISTS idx_rex_001_cheques_firm_period
    ON rex_001_cheques (firm_nr, period_nr);

-- Not: Bu şablon firma-001 için üretildi. Diğer firmalar için aynı DDL'i
-- CREATE_PERIOD_TABLES mantığında `CREATE TABLE IF NOT EXISTS rex_${firmNr}_cheques`
-- kalıbıyla yeniden üretin (firm_nr 001..NNN). Şimdilik tek firma yeterli.