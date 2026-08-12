-- apply_sync_queue_item: NOT NULL varsayılanları + müşteri/tedarikçi code çakışması

CREATE OR REPLACE FUNCTION public.normalize_sync_queue_data(
  p_schema TEXT,
  p_table_name TEXT,
  p_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_out JSONB := COALESCE(p_data, '{}'::jsonb);
  r RECORD;
BEGIN
  IF p_data IS NULL OR p_data = 'null'::jsonb THEN
    RETURN p_data;
  END IF;

  IF p_table_name ~ '_products$' THEN
    IF NOT (v_out ? 'expiry_tracking') OR v_out->'expiry_tracking' IS NULL OR v_out->'expiry_tracking' = 'null'::jsonb THEN
      v_out := v_out || '{"expiry_tracking": false}'::jsonb;
    END IF;
    IF NOT (v_out ? 'is_scale_product') OR v_out->'is_scale_product' IS NULL OR v_out->'is_scale_product' = 'null'::jsonb THEN
      v_out := v_out || '{"is_scale_product": false}'::jsonb;
    END IF;
    IF NOT (v_out ? 'has_variants') OR v_out->'has_variants' IS NULL OR v_out->'has_variants' = 'null'::jsonb THEN
      v_out := v_out || '{"has_variants": false}'::jsonb;
    END IF;
    IF NOT (v_out ? 'is_active') OR v_out->'is_active' IS NULL OR v_out->'is_active' = 'null'::jsonb THEN
      v_out := v_out || '{"is_active": true}'::jsonb;
    END IF;
    IF NOT (v_out ? 'auto_calculate_usd') OR v_out->'auto_calculate_usd' IS NULL OR v_out->'auto_calculate_usd' = 'null'::jsonb THEN
      v_out := v_out || '{"auto_calculate_usd": false}'::jsonb;
    END IF;
  END IF;

  FOR r IN
    SELECT c.column_name, c.column_default, c.udt_name
    FROM information_schema.columns c
    WHERE c.table_schema = p_schema
      AND c.table_name = p_table_name
      AND c.is_nullable = 'NO'
      AND c.column_default IS NOT NULL
      AND c.column_name <> 'id'
      AND (
        NOT (v_out ? c.column_name)
        OR v_out->c.column_name IS NULL
        OR v_out->c.column_name = 'null'::jsonb
      )
  LOOP
    IF r.udt_name = 'bool' THEN
      IF r.column_default LIKE '%true%' THEN
        v_out := v_out || jsonb_build_object(r.column_name, true);
      ELSE
        v_out := v_out || jsonb_build_object(r.column_name, false);
      END IF;
    ELSIF r.udt_name IN ('int2', 'int4', 'int8', 'numeric', 'float4', 'float8') THEN
      IF r.column_default ~ '^[0-9]+(\.[0-9]+)?' THEN
        v_out := v_out || jsonb_build_object(r.column_name, (regexp_match(r.column_default, '^[0-9]+(\.[0-9]+)?'))[1]::numeric);
      END IF;
    ELSIF r.udt_name = 'varchar' OR r.udt_name = 'text' THEN
      IF r.column_default ~ '''([^'']*)''' THEN
        v_out := v_out || jsonb_build_object(r.column_name, (regexp_match(r.column_default, '''([^'']*)'''))[1]);
      END IF;
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$ LANGUAGE plpgsql STABLE;

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
  v_data JSONB;
  v_code TEXT;
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
    RAISE;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
