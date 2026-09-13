-- ============================================================================
-- 151: sale_items.item_type + products.plu_code catch-up
-- ============================================================================
-- 098 / 104 schema_migrations'ta kayıtlı olsa bile, 096'nın sade CREATE_PERIOD_TABLES
-- stub'ı ile SONRA açılan firmalar (örn. 005/010/020) kolonları almaz.
-- Bu migration:
--   1) Tüm mevcut rex_*_*_sale_items → item_type
--   2) Tüm mevcut rex_*_products → plu_code
--   3) CREATE_PERIOD_TABLES / CREATE_FIRM_TABLES sarmalayıcı: yeni dönem/firma sonrası kolon garantisi
-- Idempotent. Tauri DO $$ serbest (psql / db:migrate).
-- ============================================================================

-- 1) Mevcut sale_items
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_sale_items$'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT ''Malzeme''',
      r.schemaname,
      r.tablename
    );
  END LOOP;
END $$;

-- 2) Mevcut products.plu_code
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
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS plu_code VARCHAR(20)',
      r.tablename
    );
  END LOOP;
END $$;

-- 3) CREATE_PERIOD_TABLES sarmalayıcı — yeni dönemlerde item_type garantisi
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_period_tables__impl'
  ) AND EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_period_tables'
       AND pg_get_function_identity_arguments(p.oid) = 'p_firm_nr character varying, p_period_nr character varying'
  ) THEN
    ALTER FUNCTION public.create_period_tables(character varying, character varying)
      RENAME TO create_period_tables__impl;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_period_tables(
  p_firm_nr VARCHAR,
  p_period_nr VARCHAR
)
RETURNS void AS $$
DECLARE
  v_firm   TEXT := lower(trim(p_firm_nr));
  v_period TEXT := lower(trim(p_period_nr));
  v_tbl    TEXT;
BEGIN
  IF to_regprocedure('public.create_period_tables__impl(character varying, character varying)') IS NOT NULL THEN
    PERFORM public.create_period_tables__impl(p_firm_nr, p_period_nr);
  END IF;

  IF length(v_firm) <= 3 THEN
    v_firm := lpad(v_firm, 3, '0');
  END IF;
  IF length(v_period) <= 2 THEN
    v_period := lpad(v_period, 2, '0');
  END IF;

  v_tbl := 'rex_' || v_firm || '_' || v_period || '_sale_items';
  IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT %L',
      v_tbl,
      'Malzeme'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 4) CREATE_FIRM_TABLES sarmalayıcı — yeni firmalarda plu_code garantisi
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_firm_tables__impl'
  ) AND EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'create_firm_tables'
       AND pg_get_function_identity_arguments(p.oid) = 'p_firm_nr character varying'
  ) THEN
    ALTER FUNCTION public.create_firm_tables(character varying)
      RENAME TO create_firm_tables__impl;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_firm_tables(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
  v_firm TEXT := lower(trim(p_firm_nr));
  v_tbl  TEXT;
BEGIN
  IF to_regprocedure('public.create_firm_tables__impl(character varying)') IS NOT NULL THEN
    PERFORM public.create_firm_tables__impl(p_firm_nr);
  END IF;

  IF length(v_firm) <= 3 THEN
    v_firm := lpad(v_firm, 3, '0');
  END IF;

  v_tbl := 'rex_' || v_firm || '_products';
  IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS plu_code VARCHAR(20)',
      v_tbl
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 5) Hizmet satış sayacı partial index (138 ile aynı; item_type artık var)
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND c.relname ~ '^rex_[0-9]{3}_[0-9]{2}_sale_items$'
       AND EXISTS (
           SELECT 1 FROM pg_attribute a
            WHERE a.attrelid = c.oid
              AND a.attname  = 'item_type'
              AND NOT a.attisdropped
       )
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (product_id, invoice_id) WHERE item_type = %L',
      rec.table_name || '_service_sale_count_idx',
      rec.schema_name,
      rec.table_name,
      'Hizmet'
    );
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
