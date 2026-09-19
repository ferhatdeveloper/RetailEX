-- Kayıtlı özel raporlar (Rapor Oluşturucu)
CREATE TABLE IF NOT EXISTS public.custom_saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sql_text TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_saved_reports_firm_nr
  ON public.custom_saved_reports (firm_nr);

CREATE INDEX IF NOT EXISTS idx_custom_saved_reports_updated
  ON public.custom_saved_reports (firm_nr, updated_at DESC);

COMMENT ON TABLE public.custom_saved_reports IS
  'Rapor Oluşturucu — kullanıcı kayıtlı SELECT raporları (firma bazlı)';
