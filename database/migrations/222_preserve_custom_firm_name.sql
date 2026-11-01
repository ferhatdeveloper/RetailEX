-- Giriş ve şema provision boş ad gönderdiğinde firms.name "Firma 001"e dönmesin.
-- Yer tutucu yalnızca satır ilk kez açılırken ve ad hâlâ boşken yazılır.
-- Özel unvan duruyorsa ad sütunu yer tutucuya çekilmişse unvan geri alınır.
-- Kasa, rezervasyon ve rol menüsü değişmez.

CREATE OR REPLACE FUNCTION public.firm_name_is_generic(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(btrim(p_name), '') = ''
      OR btrim(p_name) = 'RetailEx OS'
      OR btrim(p_name) ~ '^Firma [0-9]{3}$';
$$;

CREATE OR REPLACE FUNCTION public.resolve_provision_firm_name(
  p_existing_name TEXT,
  p_existing_title TEXT,
  p_incoming_name TEXT,
  p_firm_nr TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_firm TEXT;
  v_existing_name TEXT;
  v_existing_title TEXT;
  v_incoming TEXT;
  v_placeholder TEXT;
BEGIN
  v_firm := lpad(ltrim(regexp_replace(COALESCE(p_firm_nr, ''), '[^0-9]', '', 'g'), '0'), 3, '0');
  IF v_firm = '' OR v_firm = '000' THEN
    v_firm := '001';
  END IF;
  v_existing_name := NULLIF(btrim(COALESCE(p_existing_name, '')), '');
  v_existing_title := NULLIF(btrim(COALESCE(p_existing_title, '')), '');
  v_incoming := NULLIF(btrim(COALESCE(p_incoming_name, '')), '');
  v_placeholder := 'Firma ' || v_firm;

  IF v_incoming IS NOT NULL AND NOT public.firm_name_is_generic(v_incoming) THEN
    RETURN v_incoming;
  END IF;
  IF v_existing_name IS NOT NULL AND NOT public.firm_name_is_generic(v_existing_name) THEN
    RETURN v_existing_name;
  END IF;
  IF v_existing_title IS NOT NULL AND NOT public.firm_name_is_generic(v_existing_title) THEN
    RETURN v_existing_title;
  END IF;
  IF v_existing_name IS NOT NULL THEN
    RETURN v_existing_name;
  END IF;
  RETURN COALESCE(v_incoming, v_placeholder);
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_firm_schema(
  p_firm_nr TEXT,
  p_period_nr TEXT DEFAULT '01',
  p_firm_name TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'IQD',
  p_bootstrap_modules BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
  out_ok BOOLEAN,
  out_message TEXT
) AS $$
DECLARE
  v_firm TEXT;
  v_period TEXT;
  v_name TEXT;
  v_firm_id UUID;
  v_period_int INTEGER;
BEGIN
  v_firm := lpad(ltrim(regexp_replace(COALESCE(p_firm_nr, ''), '[^0-9]', '', 'g'), '0'), 3, '0');
  IF v_firm = '' OR v_firm = '000' THEN v_firm := '001'; END IF;
  v_period := lpad(ltrim(regexp_replace(COALESCE(p_period_nr, '01'), '[^0-9]', '', 'g'), '0'), 2, '0');
  IF v_period = '' OR v_period = '00' THEN v_period := '01'; END IF;
  v_period_int := v_period::integer;
  v_name := public.resolve_provision_firm_name(NULL, NULL, p_firm_name, v_firm);

  INSERT INTO public.firms (firm_nr, name, ana_para_birimi, raporlama_para_birimi, is_active)
  VALUES (v_firm, v_name, COALESCE(NULLIF(trim(p_currency), ''), 'IQD'), COALESCE(NULLIF(trim(p_currency), ''), 'IQD'), true)
  ON CONFLICT (firm_nr) DO UPDATE SET
    name = public.resolve_provision_firm_name(firms.name, firms.title, p_firm_name, v_firm),
    is_active = true;

  SELECT id INTO v_firm_id FROM public.firms WHERE firm_nr = v_firm LIMIT 1;
  IF v_firm_id IS NOT NULL THEN
    INSERT INTO public.periods (firm_id, nr, beg_date, end_date, is_active, "default")
    VALUES (v_firm_id, v_period_int, DATE '2026-01-01', DATE '2026-12-31', true, true)
    ON CONFLICT (firm_id, nr) DO UPDATE SET is_active = true;
  END IF;

  PERFORM public.CREATE_FIRM_TABLES(v_firm);
  PERFORM public.CREATE_PERIOD_TABLES(v_firm, v_period);

  IF COALESCE(p_bootstrap_modules, true) THEN
    BEGIN
      PERFORM public.INIT_RESTAURANT_FIRM_TABLES(v_firm);
      PERFORM public.INIT_BEAUTY_FIRM_TABLES(v_firm);
      PERFORM public.INIT_RESTAURANT_PERIOD_TABLES(v_firm, v_period);
      PERFORM public.INIT_BEAUTY_PERIOD_TABLES(v_firm, v_period);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  out_ok := true;
  out_message := format('Firma %s dönem %s şeması hazır.', v_firm, v_period);
  RETURN NEXT;
EXCEPTION WHEN OTHERS THEN
  out_ok := false;
  out_message := SQLERRM;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.provision_firm_schema(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon;

NOTIFY pgrst, 'reload schema';
