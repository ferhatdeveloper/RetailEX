-- Cari / tedarikçi artımlı senkron: updated_at + backfill değişenleri yeniden kuyruklar.
-- Ürünlerde updated_at varken caride yoktu → MPOS/hibrit aktarım caride patlıyor veya bir kez
-- completed olduktan sonra bir daha gitmiyordu.

-- 1) Mevcut firma kart tablolarına updated_at
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_(customers|suppliers)$'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP',
      r.tablename
    );
    EXECUTE format(
      'UPDATE %I SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL',
      r.tablename
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (updated_at DESC NULLS LAST)',
      'idx_' || r.tablename || '_updated_at',
      r.tablename
    );
    -- BEFORE UPDATE → updated_at
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', r.tablename, r.tablename);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      r.tablename,
      r.tablename
    );
    -- Sync trigger (varsa)
    BEGIN
      PERFORM public.try_apply_sync_triggers(r.tablename);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- 2) Yeni firma oluştururken CREATE_FIRM_TABLES içinde kolon olsun
-- (000_master_schema + 060 dosyaları ayrı güncellenir; burada fonksiyon yeniden yazılmaz —
--  yalnızca mevcut DB'lerdeki create_firm_tables gövdesi 000/060 ile senkron tutulur.)

-- 3) enqueue_hybrid_backfill: completed kayıtları, updated_at/imza değiştiyse yeniden kuyrukla
CREATE OR REPLACE FUNCTION public.enqueue_hybrid_backfill(
  p_firm_nr VARCHAR,
  p_row_limit INTEGER DEFAULT 2000,
  p_changed_since TIMESTAMPTZ DEFAULT NULL
)
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
  v_has_updated_at BOOLEAN;
  v_sql TEXT;
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
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v_table.tablename
        AND c.column_name = 'updated_at'
    ) INTO v_has_updated_at;

    IF v_has_updated_at AND p_changed_since IS NOT NULL THEN
      -- Artımlı: aynı imzadaki completed atlanır; updated_at değişmişse yeniden kuyruk
      v_sql := format(
        $q$
        SELECT t.id, COALESCE(NULLIF(t.firm_nr, ''), %L)::varchar AS firm_nr, to_jsonb(t) AS data
        FROM %I t
        WHERE t.updated_at >= %L::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id
            AND sq.status = 'pending' AND sq.retry_count < 10
        )
        AND NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id
            AND sq.status = 'completed'
            AND COALESCE(sq.data->>'updated_at', md5(sq.data::text))
                IS NOT DISTINCT FROM COALESCE(t.updated_at::text, md5(to_jsonb(t)::text))
        )
        ORDER BY t.updated_at ASC NULLS LAST
        LIMIT %s
        $q$,
        v_firm_padded,
        v_table.tablename,
        p_changed_since,
        v_table.tablename,
        v_table.tablename,
        v_limit
      );
    ELSIF v_has_updated_at THEN
      -- Full: henüz hiç completed olmayanlar + updated_at'ı olan tüm yeni kayıtlar
      v_sql := format(
        $q$
        SELECT t.id, COALESCE(NULLIF(t.firm_nr, ''), %L)::varchar AS firm_nr, to_jsonb(t) AS data
        FROM %I t
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id
            AND sq.status = 'pending' AND sq.retry_count < 10
        )
        AND NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id
            AND sq.status = 'completed'
            AND COALESCE(sq.data->>'updated_at', md5(sq.data::text))
                IS NOT DISTINCT FROM COALESCE(t.updated_at::text, md5(to_jsonb(t)::text))
        )
        ORDER BY t.updated_at ASC NULLS LAST
        LIMIT %s
        $q$,
        v_firm_padded,
        v_table.tablename,
        v_table.tablename,
        v_table.tablename,
        v_limit
      );
    ELSE
      v_sql := format(
        $q$
        SELECT t.id, COALESCE(NULLIF(t.firm_nr, ''), %L)::varchar AS firm_nr, to_jsonb(t) AS data
        FROM %I t
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id AND sq.status = 'completed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM sync_queue sq
          WHERE sq.table_name = %L AND sq.record_id = t.id
            AND sq.status = 'pending' AND sq.retry_count < 10
        )
        LIMIT %s
        $q$,
        v_firm_padded,
        v_table.tablename,
        v_table.tablename,
        v_table.tablename,
        v_limit
      );
    END IF;

    FOR v_row IN EXECUTE v_sql
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

NOTIFY pgrst, 'reload schema';
