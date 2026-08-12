-- Kullanıcının görebileceği firma, dönem ve mağaza/depo kısıtlamaları
-- allowed_firm_nrs: ['001','002'] — boş ise sadece users.firm_nr
-- allowed_periods: [{"firm_nr":"001","period_nr":1}, ...] — boş ise seçili firmaların tüm dönemleri
-- allowed_store_ids: [uuid, ...] — boş ise tüm mağaza/depo
-- Bu migration çalıştırılmadan kullanıcı kaydetme "allowed_firm_nrs kolonu mevcut değil" hatası verir.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS allowed_firm_nrs JSONB DEFAULT '[]';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS allowed_periods JSONB DEFAULT '[]';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS allowed_store_ids JSONB DEFAULT '[]';

COMMENT ON COLUMN public.users.allowed_firm_nrs IS 'Kullanıcının erişebileceği firma numaraları. Boş array = sadece firm_nr.';
COMMENT ON COLUMN public.users.allowed_periods IS 'Kullanıcının görebileceği (firm_nr, period_nr) çiftleri. Boş = tüm dönemler.';
COMMENT ON COLUMN public.users.allowed_store_ids IS 'Kullanıcının görebileceği mağaza/depo (stores) id listesi. Boş = tümü.';
