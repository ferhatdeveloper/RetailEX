-- 104: Genel üretim emirlerine alış faturası bağlantısı (çift belge engeli)
-- production_orders: purchase_invoice_id / no + tedarikçi alanları
-- INIT_PRODUCTION_TABLES güncellendi (master şema 000_master_schema.sql);
-- bu migration mevcut firmalardaki tabloları ALTER ile güvenli şekilde günceller.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT regexp_replace(tablename, '^rex_([0-9]+)_production_orders$', '\1') AS firm_nr
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_production_orders$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS purchase_invoice_id UUID', 'rex_' || r.firm_nr || '_production_orders');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS purchase_invoice_no VARCHAR(80)', 'rex_' || r.firm_nr || '_production_orders');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS supplier_id UUID', 'rex_' || r.firm_nr || '_production_orders');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255)', 'rex_' || r.firm_nr || '_production_orders');
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';