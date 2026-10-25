-- Malzeme kartı güvenli stok seviyesi.
-- min_stock ve max_stock durur. Vergi kolonları silinmez.
-- Yeni firma: create_firm_tables sarmalayıcısı aynı kolonu ekler.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename ~ '^rex_[0-9]+_products$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS safe_stock DECIMAL(15,2) DEFAULT 0',
      r.tablename
    );
  END LOOP;
END $$;

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
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS safe_stock DECIMAL(15,2) DEFAULT 0',
      v_tbl
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
