-- GİB entegratör modları: Nilvera (REST) ve QNB eSolutions (web servis) dahil açıklamalar

COMMENT ON COLUMN public.firms.gib_integration_mode IS
  'mock | nilvera | qnb_esolutions | integrator | direct_unconfigured';

COMMENT ON COLUMN public.firms.gib_integrator_base_url IS
  'Nilvera: REST kök (örn. https://apitest.nilvera.com veya https://api.nilvera.com). QNB: web servis/SOAP taban adresi (dokümandaki üretim veya test uçları).';

COMMENT ON COLUMN public.firms.gib_integrator_username IS
  'QNB ve genel entegratör: portal / web servis kullanıcısı. Nilvera REST: genelde boş (kimlik Bearer API anahtarı ile).';

COMMENT ON COLUMN public.firms.gib_integrator_password IS
  'QNB ve genel: şifre. Nilvera: Portalda üretilen API anahtarı (Authorization: Bearer). Boş bırakılırsa güncellemede mevcut değer korunur.';

COMMENT ON COLUMN public.firms.gib_use_test_environment IS
  'true: entegratör test uçları (Nilvera için apitest önerilir). false: canlı.';
