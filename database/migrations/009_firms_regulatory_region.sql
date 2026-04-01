-- Firma mevzuat bölgesi: TR = GİB e-Fatura/e-Arşiv; IQ = Irak vb.
ALTER TABLE firms ADD COLUMN IF NOT EXISTS regulatory_region VARCHAR(2) NOT NULL DEFAULT 'IQ';

COMMENT ON COLUMN firms.regulatory_region IS 'TR: Türkiye (GİB e-belge); IQ: Irak ve diğer';
