-- ============================================================================
-- 054: Müşteri kartına isteğe bağlı tedarikçi benzeri alanlar (eski tenant uyumu)
-- Not: Uygulama PATCH'te yalnızca mevcut kolonları yazar; bu migration eksik DB'leri hizalar.
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100)',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,2) DEFAULT 0',
      r.tablename
    );
  END LOOP;
END $$;
