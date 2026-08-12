-- Hibrit mod: sync_queue kayıtlarını hedef PG'ye uygula; tetikleyici döngüsünü engelle

CREATE OR REPLACE FUNCTION public.enqueue_sync_event()
RETURNS TRIGGER AS $$
DECLARE
  v_firm_nr  VARCHAR;
  v_record_id UUID;
  v_data     JSONB;
BEGIN
  IF COALESCE(current_setting('retailex.sync_apply', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    IF (TG_OP = 'DELETE') THEN
      v_firm_nr := OLD.firm_nr; v_record_id := OLD.id; v_data := row_to_json(OLD)::JSONB;
    ELSE
      v_firm_nr := NEW.firm_nr; v_record_id := NEW.id; v_data := row_to_json(NEW)::JSONB;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_firm_nr := '001';
    IF (TG_OP = 'DELETE') THEN v_record_id := OLD.id; v_data := row_to_json(OLD)::JSONB;
    ELSE v_record_id := NEW.id; v_data := row_to_json(NEW)::JSONB; END IF;
  END;
  UPDATE sync_queue SET data = v_data, action = TG_OP, created_at = NOW()
  WHERE table_name = TG_TABLE_NAME AND record_id = v_record_id AND status = 'pending';
  IF NOT FOUND THEN
    INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.resolve_table_schema(p_table_name TEXT)
RETURNS TEXT AS $$
  SELECT table_schema
  FROM information_schema.tables
  WHERE table_name = p_table_name
    AND table_schema IN ('public', 'wms', 'rest', 'beauty', 'auth', 'logic', 'pos')
  ORDER BY CASE table_schema WHEN 'public' THEN 0 ELSE 1 END
  LIMIT 1;
$$ LANGUAGE sql STABLE;

DROP FUNCTION IF EXISTS public.apply_sync_queue_item(TEXT, TEXT, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.apply_sync_queue_item(
  p_table_name TEXT,
  p_action TEXT,
  p_record_id UUID,
  p_data JSONB
) RETURNS void AS $$
DECLARE
  v_schema TEXT;
  v_updates TEXT;
  v_sql TEXT;
BEGIN
  PERFORM set_config('retailex.sync_apply', '1', true);

  v_schema := public.resolve_table_schema(p_table_name);
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tablo bulunamadı: %', p_table_name;
  END IF;

  IF upper(p_action) = 'DELETE' THEN
    v_sql := format('DELETE FROM %I.%I WHERE id = $1', v_schema, p_table_name);
    EXECUTE v_sql USING p_record_id;
    RETURN;
  END IF;

  IF p_data IS NULL OR p_data = 'null'::jsonb THEN
    RETURN;
  END IF;

  SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ')
  INTO v_updates
  FROM information_schema.columns
  WHERE table_schema = v_schema
    AND table_name = p_table_name
    AND column_name <> 'id';

  IF v_updates IS NULL OR v_updates = '' THEN
    v_sql := format(
      'INSERT INTO %I.%I SELECT * FROM jsonb_populate_record(null::%I.%I, $1) ON CONFLICT (id) DO NOTHING',
      v_schema, p_table_name, v_schema, p_table_name
    );
  ELSE
    v_sql := format(
      'INSERT INTO %I.%I SELECT * FROM jsonb_populate_record(null::%I.%I, $1) ON CONFLICT (id) DO UPDATE SET %s',
      v_schema, p_table_name, v_schema, p_table_name, v_updates
    );
  END IF;

  EXECUTE v_sql USING p_data;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
