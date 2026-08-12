-- apply_sync_queue_item: ürün ref_id (Logo LOGICALREF) çakışmasında mevcut kayda birleştir

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
  v_data JSONB;
  v_code TEXT;
  v_ref_id INTEGER;
  v_existing_id UUID;
  v_record_id UUID := p_record_id;
BEGIN
  PERFORM set_config('retailex.sync_apply', '1', true);

  v_schema := public.resolve_table_schema(p_table_name);
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tablo bulunamadı: %', p_table_name;
  END IF;

  IF upper(p_action) = 'DELETE' THEN
    v_sql := format('DELETE FROM %I.%I WHERE id = $1', v_schema, p_table_name);
    EXECUTE v_sql USING v_record_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected > 0 THEN
      RETURN 'delete';
    END IF;
    RETURN 'skip';
  END IF;

  IF p_data IS NULL OR p_data = 'null'::jsonb THEN
    RETURN 'noop';
  END IF;

  v_data := public.normalize_sync_queue_data(v_schema, p_table_name, p_data);

  IF NOT (v_data ? 'id') OR v_data->>'id' IS NULL OR v_data->'id' = 'null'::jsonb THEN
    v_data := v_data || jsonb_build_object('id', v_record_id);
  END IF;

  IF p_table_name ~ '_(customers|suppliers)$' THEN
    v_code := NULLIF(trim(v_data->>'code'), '');
    IF v_code IS NOT NULL THEN
      EXECUTE format('SELECT id FROM %I.%I WHERE code = $1 LIMIT 1', v_schema, p_table_name)
        INTO v_existing_id
        USING v_code;
      IF v_existing_id IS NOT NULL AND v_existing_id <> v_record_id THEN
        v_record_id := v_existing_id;
        v_data := v_data || jsonb_build_object('id', v_existing_id);
      END IF;
    END IF;
  END IF;

  IF p_table_name ~ '_products$' THEN
    v_ref_id := NULLIF(regexp_replace(COALESCE(v_data->>'ref_id', ''), '\D', '', 'g'), '')::INTEGER;
    IF v_ref_id IS NOT NULL AND v_ref_id > 0 THEN
      EXECUTE format('SELECT id FROM %I.%I WHERE ref_id = $1 LIMIT 1', v_schema, p_table_name)
        INTO v_existing_id
        USING v_ref_id;
      IF v_existing_id IS NOT NULL AND v_existing_id <> v_record_id THEN
        v_record_id := v_existing_id;
        v_data := v_data || jsonb_build_object('id', v_existing_id);
      END IF;
    END IF;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE id = $1)', v_schema, p_table_name)
    INTO v_exists
    USING v_record_id;

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
    EXECUTE v_sql USING v_data;
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
  EXECUTE v_sql USING v_data;

  IF v_exists THEN
    RETURN 'update';
  END IF;
  RETURN 'insert';
EXCEPTION
  WHEN unique_violation THEN
    IF p_table_name ~ '_(customers|suppliers)$' AND (v_data->>'code') IS NOT NULL THEN
      EXECUTE format(
        'UPDATE %I.%I t SET %s FROM jsonb_populate_record(null::%I.%I, $1) AS src WHERE t.code = $2',
        v_schema,
        p_table_name,
        (
          SELECT string_agg(format('%I = src.%I', column_name, column_name), ', ')
          FROM information_schema.columns
          WHERE table_schema = v_schema
            AND table_name = p_table_name
            AND column_name NOT IN ('id', 'code')
        ),
        v_schema,
        p_table_name
      ) USING v_data, v_data->>'code';
      GET DIAGNOSTICS v_affected = ROW_COUNT;
      IF v_affected > 0 THEN
        RETURN 'update';
      END IF;
      RETURN 'skip';
    END IF;
    IF p_table_name ~ '_products$' AND (v_data->>'ref_id') IS NOT NULL THEN
      v_ref_id := NULLIF(regexp_replace(v_data->>'ref_id', '\D', '', 'g'), '')::INTEGER;
      IF v_ref_id IS NOT NULL AND v_ref_id > 0 THEN
        EXECUTE format(
          'UPDATE %I.%I t SET %s FROM jsonb_populate_record(null::%I.%I, $1) AS src WHERE t.ref_id = $2',
          v_schema,
          p_table_name,
          (
            SELECT string_agg(format('%I = src.%I', column_name, column_name), ', ')
            FROM information_schema.columns
            WHERE table_schema = v_schema
              AND table_name = p_table_name
              AND column_name NOT IN ('id', 'ref_id')
          ),
          v_schema,
          p_table_name
        ) USING v_data, v_ref_id;
        GET DIAGNOSTICS v_affected = ROW_COUNT;
        IF v_affected > 0 THEN
          RETURN 'update';
        END IF;
        RETURN 'skip';
      END IF;
    END IF;
    RAISE;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
