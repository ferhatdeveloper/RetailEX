-- Web / çok istemci: tarayıcı localStorage yerine tek doğruluk kaynağı (varsayılan firma, para birimi)
CREATE TABLE IF NOT EXISTS public.system_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  CONSTRAINT system_settings_singleton CHECK (id = 1),
  default_currency VARCHAR(10) NOT NULL DEFAULT 'IQD',
  primary_firm_nr VARCHAR(10),
  primary_period_nr VARCHAR(10),
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.system_settings IS 'Tek satır (id=1): uygulama açılışında kullanılacak varsayılanlar (özellikle web).';

INSERT INTO public.system_settings (id, default_currency, primary_firm_nr, primary_period_nr)
VALUES (1, 'IQD', '001', '01')
ON CONFLICT (id) DO NOTHING;
