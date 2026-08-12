-- apply_sync_queue_item: insert / update / skip / delete / noop döndürür (tekrarlı kayıt raporu)

DROP FUNCTION IF EXISTS public.apply_sync_queue_item(TEXT, TEXT, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.apply_sync_queue_item(
  p_table_name TEXT,
  p_action TEXT,
  p_record_id UUID,
  p_data JSONB
) RETURNS TEXT AS $$
DECLARE
  v_schema TEXT;
  v_updates TEXT;
  v_sql TEXT;
  v_exists BOOLEAN;
  v_affected INT;
BEGIN
  PERFORM set_config('retailex.sync_apply', '1', true);

  v_schema := public.resolve_table_schema(p_table_name);
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tablo bulunamadı: %', p_table_name;
  END IF;

  IF upper(p_action) = 'DELETE' THEN
    v_sql := format('DELETE FROM %I.%I WHERE id = $1', v_schema, p_table_name);
    EXECUTE v_sql USING p_record_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected > 0 THEN
      RETURN 'delete';
    END IF;
    RETURN 'skip';
  END IF;

  IF p_data IS NULL OR p_data = 'null'::jsonb THEN
    RETURN 'noop';
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE id = $1)', v_schema, p_table_name)
    INTO v_exists
    USING p_record_id;

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
    EXECUTE v_sql USING p_data;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected > 0 THEN
      RETURN 'insert';
    END IF;
    RETURN 'skip';
  END IF;

  v_sql := format(
    'INSERT INTO %I.%I SELECT * FROM jsonb_populate_record(null::%I.%I, $1) ON CONFLICT (id) DO UPDATE SET %s',
    v_schema, p_table_name, v_schema, p_table_name, v_updates
  );
  EXECUTE v_sql USING p_data;

  IF v_exists THEN
    RETURN 'update';
  END IF;
  RETURN 'insert';
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
