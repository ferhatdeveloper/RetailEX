-- Rapor ve Etiket Tasarımları için Tablo
-- Created: 2026-02-14

CREATE TABLE IF NOT EXISTS public.report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'fatura', 'etiket', 'fis', 'rapor'
    template_type VARCHAR(50) DEFAULT 'json',
    content JSONB NOT NULL, -- Tasarım verisi (bileşenler, pozisyonlar, stiller)
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id),
    firm_nr INTEGER,
    period_nr INTEGER
);

-- Default kategori indeksleri
CREATE INDEX IF NOT EXISTS idx_report_templates_category ON public.report_templates(category);
CREATE INDEX IF NOT EXISTS idx_report_templates_firm_period ON public.report_templates(firm_nr, period_nr);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_report_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_report_templates_updated_at
    BEFORE UPDATE ON public.report_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_report_templates_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'report_templates' AND policyname = 'Allow authenticated users to read templates') THEN
            CREATE POLICY "Allow authenticated users to read templates"
                ON public.report_templates FOR SELECT
                TO authenticated
                USING (true);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'report_templates' AND policyname = 'Allow authorized users to insert templates') THEN
            CREATE POLICY "Allow authorized users to insert templates"
                ON public.report_templates FOR INSERT
                TO authenticated
                WITH CHECK (true);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'report_templates' AND policyname = 'Allow authorized users to update templates') THEN
            CREATE POLICY "Allow authorized users to update templates"
                ON public.report_templates FOR UPDATE
                TO authenticated
                USING (true);
        END IF;
    END IF;
END $$;

