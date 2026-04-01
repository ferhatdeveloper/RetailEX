-- Firma kartı: GİB / e-Fatura bağlantı bilgileri (entegratör veya doğrudan erişim için; şifre boş bırakılırsa güncellemede korunur)

ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS gib_integration_mode VARCHAR(20) NOT NULL DEFAULT 'mock';
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS gib_ubl_profile VARCHAR(40) DEFAULT 'TICARIFATURA';
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS gib_sender_alias VARCHAR(255);
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS gib_integrator_base_url VARCHAR(512);
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS gib_integrator_username VARCHAR(255);
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS gib_integrator_password VARCHAR(255);
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS gib_use_test_environment BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.firms.gib_integration_mode IS 'mock | nilvera | qnb_esolutions | integrator | direct_unconfigured';
COMMENT ON COLUMN public.firms.gib_ubl_profile IS 'UBL profil: TICARIFATURA, EARSIVFATURA, TEMELFATURA vb.';
COMMENT ON COLUMN public.firms.gib_sender_alias IS 'GİB posta kutusu URN (örn. urn:mail:defaultpk@... )';
