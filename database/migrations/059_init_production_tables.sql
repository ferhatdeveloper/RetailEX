-- 059: Üretim modülü tablolarını mevcut firmalar için güvenli oluştur
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT regexp_replace(tablename, '^rex_([0-9]+)_products$', '\1') AS firm_nr
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    PERFORM public.INIT_PRODUCTION_TABLES(r.firm_nr);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
