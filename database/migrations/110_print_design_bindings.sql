-- 110: Belge turu -> yazdirma dizayni eslestirmeleri
-- Design Center sablon id'leri UUID olmayabildigi icin design_ref, FastReport .frx
-- satirlari icin report_templates.id UUID'si design_id alaninda tutulur.

CREATE TABLE IF NOT EXISTS public.print_design_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  scope VARCHAR(64) NOT NULL,
  design_kind VARCHAR(32) NOT NULL DEFAULT 'fastreport_frx',
  design_id UUID,
  design_ref TEXT,
  design_name TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(firm_nr, scope),
  CONSTRAINT print_design_bindings_design_kind_chk
    CHECK (design_kind IN ('fastreport_frx', 'design_center', 'builtin'))
);

CREATE INDEX IF NOT EXISTS idx_print_design_bindings_firm_active
  ON public.print_design_bindings (firm_nr, is_active, scope);

COMMENT ON TABLE public.print_design_bindings IS
  'Firma bazinda belge turu -> yazdirma dizayni eslestirmesi.';
COMMENT ON COLUMN public.print_design_bindings.scope IS
  'PrintDesignScope: pos_receipt, invoice_sales, kitchen_ticket, account_receipt, cash_voucher vb.';
COMMENT ON COLUMN public.print_design_bindings.design_kind IS
  'fastreport_frx | design_center | builtin';
COMMENT ON COLUMN public.print_design_bindings.design_id IS
  'fastreport_frx icin public.report_templates.id.';
COMMENT ON COLUMN public.print_design_bindings.design_ref IS
  'Design Center katalog sablon id''si veya ilerideki harici referans.';

COMMENT ON COLUMN public.report_templates.template_type IS
  'json, template_designer_v2 veya FastReport .frx icin fastreport_frx.';
COMMENT ON COLUMN public.report_templates.content IS
  'JSONB sablon icerigi; fastreport_frx satirlarinda { "frxXml": "..." } bicimi beklenir.';
