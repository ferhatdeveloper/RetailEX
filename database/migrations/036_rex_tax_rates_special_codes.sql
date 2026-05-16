-- ============================================================================
-- 036: rex_{firm}_tax_rates ve rex_{firm}_special_codes tabloları
-- ============================================================================
-- PostgREST / masterData.ts API'si bu tabloları bekliyor.
-- Mevcut firmalar için idempotent şekilde oluşturulur.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_prefix TEXT;
BEGIN
  FOR r IN SELECT DISTINCT firm_nr FROM public.firms WHERE firm_nr IS NOT NULL
  LOOP
    v_prefix := 'rex_' || lower(r.firm_nr);

    -- tax_rates
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rate        DECIMAL(5,2) NOT NULL,
      description VARCHAR(255),
      is_active   BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );', v_prefix || '_tax_rates');

    EXECUTE format('INSERT INTO %I (rate, description) VALUES
      (0,    ''Vergisiz''),
      (1,    ''%%1 KDV''),
      (8,    ''%%8 KDV''),
      (10,   ''%%10 KDV''),
      (18,   ''%%18 KDV''),
      (20,   ''%%20 KDV'')
      ON CONFLICT DO NOTHING;', v_prefix || '_tax_rates');

    -- special_codes
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code        VARCHAR(50),
      name        VARCHAR(255) NOT NULL,
      description TEXT,
      module_type VARCHAR(50),
      is_active   BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );', v_prefix || '_special_codes');

    RAISE NOTICE 'Firma % için tax_rates ve special_codes oluşturuldu.', r.firm_nr;
  END LOOP;
END $$;

-- anon rolüne yeni tablolar için de yetki ver
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
