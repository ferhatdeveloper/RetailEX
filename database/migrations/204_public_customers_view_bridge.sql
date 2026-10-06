-- ============================================================================
-- Migration 204: public.customers VIEW köprüsü
-- ----------------------------------------------------------------------------
-- Sorun:
--   PostgREST tabanlı sorgularda uygulama "/customers" (public.customers) yolunu
--   kullanıyor; ancak master şema sadece firma-prefix'li tablolar oluşturuyor
--   (rex_001_customers, rex_002_customers, ...).  Bu da 42P01 "relation does
--   not exist" hatasına, ardından AppointmentPOS'ta "migration_required" → 181/182
--   uygulanmadı mesajına yol açıyor.
--
-- Kök neden: master şemada `public.customers` (ve `public.suppliers`,
-- `public.products`) yok; sadece `public.rex_<firmNr>_<periodNr>_*` var.
-- Uygulamanın bazı eski kod yolları hâlâ `customers` (schema-less) arıyor.
--
-- Bu migration (idempotent):
--   * `public.customers`     →  rex_001_customers     VIEW (firm 001 köprüsü)
--   * `public.suppliers`     →  rex_001_suppliers     VIEW
--   * `public.products`      →  rex_001_products      VIEW
--   * `public.brands`        →  rex_001_brands        VIEW (yoksa no-op)
--   * `public.categories`    →  rex_001_categories    VIEW (yoksa no-op)
--
-- İleride uygulama tamamen rex_001_* yoluna geçince bu VIEW'lar kaldırılabilir.
-- ============================================================================

-- Sadece eksik olanları oluştur (public.brands, public.categories zaten BASE TABLE;
-- onlara dokunma).  customers, suppliers, products VIEW olarak köprü olur.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='customers'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rex_001_customers'
  ) THEN
    EXECUTE 'CREATE VIEW public.customers AS SELECT * FROM public.rex_001_customers';
    RAISE NOTICE 'public.customers VIEW oluşturuldu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='suppliers'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rex_001_suppliers'
  ) THEN
    EXECUTE 'CREATE VIEW public.suppliers AS SELECT * FROM public.rex_001_suppliers';
    RAISE NOTICE 'public.suppliers VIEW oluşturuldu';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='products'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rex_001_products'
  ) THEN
    EXECUTE 'CREATE VIEW public.products AS SELECT * FROM public.rex_001_products';
    RAISE NOTICE 'public.products VIEW oluşturuldu';
  END IF;
END $$;

-- schema_migrations'a kayıt
INSERT INTO public.schema_migrations (filename) VALUES ('204_public_customers_view_bridge.sql')
  ON CONFLICT DO NOTHING;
