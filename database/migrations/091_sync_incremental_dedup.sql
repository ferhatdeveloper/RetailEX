-- Artımlı senkron: zaten gönderilmiş/değişmemiş kayıtları tekrar kuyruğa alma;
-- apply_sync_queue_item değişmeyen satırda skip döndürür.

CREATE OR REPLACE FUNCTION public.prune_redundant_sync_queue(p_firm_nr VARCHAR DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_norm TEXT;
BEGIN
  v_norm := lpad(ltrim(COALESCE(p_firm_nr, ''), '0'), 3, '0');
  DELETE FROM sync_queue p
  WHERE p.status = 'pending'
    AND (
      p_firm_nr IS NULL OR p_firm_nr = ''
      OR lpad(ltrim(p.firm_nr, '0'), 3, '0') = v_norm
    )
    AND EXISTS (
      SELECT 1
      FROM sync_queue c
      WHERE c.table_name = p.table_name
        AND c.record_id = p.record_id
        AND c.status = 'completed'
        AND COALESCE(c.data->>'updated_at', md5(c.data::text))
            IS NOT DISTINCT FROM COALESCE(p.data->>'updated_at', md5(p.data::text))
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enqueue_sync_event()
RETURNS TRIGGER AS $$
DECLARE
  v_firm_nr  VARCHAR;
  v_record_id UUID;
  v_data     JSONB;
  v_sig TEXT;
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

  IF TG_OP <> 'DELETE' THEN
    v_sig := COALESCE(v_data->>'updated_at', md5(v_data::text));
    IF EXISTS (
      SELECT 1
      FROM sync_queue sq
      WHERE sq.table_name = TG_TABLE_NAME
        AND sq.record_id = v_record_id
        AND sq.status = 'completed'
        AND COALESCE(sq.data->>'updated_at', md5(sq.data::text)) IS NOT DISTINCT FROM v_sig
      ORDER BY sq.synced_at DESC NULLS LAST
      LIMIT 1
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  UPDATE sync_queue SET data = v_data, action = TG_OP, created_at = NOW()
  WHERE table_name = TG_TABLE_NAME AND record_id = v_record_id AND status = 'pending';
  IF NOT FOUND THEN
    INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

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
  v_existing_updated TEXT;
  v_incoming_updated TEXT;
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

  v_incoming_updated := NULLIF(trim(v_data->>'updated_at'), '');
  IF v_exists AND v_incoming_updated IS NOT NULL THEN
    BEGIN
      EXECUTE format(
        'SELECT to_char(t.updated_at AT TIME ZONE ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'') FROM %I.%I t WHERE t.id = $1',
        v_schema,
        p_table_name
      )
        INTO v_existing_updated
        USING v_record_id;
    EXCEPTION WHEN OTHERS THEN
      v_existing_updated := NULL;
    END;
    IF v_existing_updated IS NOT NULL AND v_existing_updated = v_incoming_updated THEN
      RETURN 'skip';
    END IF;
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
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RETURN 'skip';
  END IF;

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
