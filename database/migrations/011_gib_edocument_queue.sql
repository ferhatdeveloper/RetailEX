-- GİB e-belge kuyruğu: satış fişleri / faturalar burada izlenir; GİB yanıtı mock (geliştirme).

CREATE TABLE IF NOT EXISTS public.gib_edocument_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  period_nr VARCHAR(10) NOT NULL,
  source_type VARCHAR(32) NOT NULL DEFAULT 'sales_fiche',
  source_id UUID NOT NULL,
  document_no VARCHAR(100),
  doc_type VARCHAR(32) NOT NULL DEFAULT 'E-Fatura',
  customer_name TEXT,
  doc_date DATE,
  amount NUMERIC(18,4) DEFAULT 0,
  tax_amount NUMERIC(18,4) DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'Taslak',
  gib_uuid UUID,
  payload_json JSONB,
  xml_snapshot TEXT,
  gib_response_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT gib_edocument_queue_unique_source UNIQUE (firm_nr, period_nr, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_gib_edoc_firm_period ON public.gib_edocument_queue (firm_nr, period_nr, created_at DESC);

COMMENT ON TABLE public.gib_edocument_queue IS 'E-Dönüşüm kuyruğu; gönderim GİB mock taşıyıcı ile test edilir.';
