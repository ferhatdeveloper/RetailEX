-- ============================================================================
-- 006: Supabase Firma ID + Ürün CDN Resim Alanı
-- ============================================================================
-- Firma başına Supabase'deki firma/organization ID'si ve ürün resmi için CDN URL.
-- Bu sayede ürün ve resim CRUD işlemleri Supabase tarafına da yansıtılabilir.
-- ============================================================================

-- 1. Firma tablosuna Supabase firma ID (Supabase'deki organization/tenant id)
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS supabase_firm_id VARCHAR(255);
COMMENT ON COLUMN public.firms.supabase_firm_id IS 'Supabase tarafındaki firma/organization ID; ürün ve resim senkronu için kullanılır.';

-- 2. Mevcut rex_*_products tablolarına image_url_cdn kolonu ekle
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS image_url_cdn TEXT', r.tablename);
  END LOOP;
END $$;
