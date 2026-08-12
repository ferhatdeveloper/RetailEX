-- Hibrit senkron: yerelde olup kuyruğa düşmemiş kayıtları sync_queue'ya ekle;
-- tükenmiş (retry_count >= 10) bekleyenleri sıfırla.

CREATE OR REPLACE FUNCTION public.reset_exhausted_sync_queue(p_firm_nr VARCHAR DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_norm TEXT;
BEGIN
  v_norm := lpad(ltrim(COALESCE(p_firm_nr, ''), '0'), 3, '0');
  UPDATE sync_queue
  SET retry_count = 0,
      error_message = NULL,
      status = 'pending',
      created_at = NOW()
  WHERE status = 'pending'
    AND retry_count >= 10
    AND (
      p_firm_nr IS NULL OR p_firm_nr = ''
      OR lpad(ltrim(firm_nr, '0'), 3, '0') = v_norm
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enqueue_hybrid_backfill(p_firm_nr VARCHAR, p_row_limit INTEGER DEFAULT 2000)
RETURNS INTEGER AS $$
DECLARE
  v_firm_raw TEXT := ltrim(COALESCE(p_firm_nr, '001'), '0');
  v_firm_padded TEXT := lpad(COALESCE(NULLIF(v_firm_raw, ''), '1'), 3, '0');
  v_table RECORD;
  v_row RECORD;
  v_total INTEGER := 0;
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_row_limit, 2000), 10000));
  v_pat_card TEXT;
  v_pat_period TEXT;
BEGIN
  v_pat_card := '^rex_(' || v_firm_raw || '|' || v_firm_padded || ')_(customers|suppliers|products)$';
  v_pat_period := '^rex_(' || v_firm_raw || '|' || v_firm_padded || ')_[0-9]+_(sales|sale_items|cash_lines|stock_movements|stock_movement_items)$';

  FOR v_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename ~ v_pat_card OR tablename ~ v_pat_period)
    ORDER BY tablename
  LOOP
    FOR v_row IN EXECUTE format(
      $q$
      SELECT t.id, COALESCE(NULLIF(t.firm_nr, ''), %L)::varchar AS firm_nr, to_jsonb(t) AS data
      FROM %I t
      WHERE NOT EXISTS (
        SELECT 1 FROM sync_queue sq
        WHERE sq.table_name = %L
          AND sq.record_id = t.id
          AND sq.status = 'completed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM sync_queue sq
        WHERE sq.table_name = %L
          AND sq.record_id = t.id
          AND sq.status = 'pending'
          AND sq.retry_count < 10
      )
      LIMIT %s
      $q$,
      v_firm_padded,
      v_table.tablename,
      v_table.tablename,
      v_table.tablename,
      v_limit
    )
    LOOP
      INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data)
      VALUES (v_table.tablename, v_row.id, 'UPDATE', v_row.firm_nr, v_row.data);
      v_total := v_total + 1;
      EXIT WHEN v_total >= v_limit;
    END LOOP;
    EXIT WHEN v_total >= v_limit;
  END LOOP;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;
