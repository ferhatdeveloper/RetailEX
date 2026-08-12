-- Hibrit senkron: cihaz bazlı transfer logu, watermark cursor, artımlı backfill

CREATE TABLE IF NOT EXISTS public.device_sync_cursor (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id          TEXT NOT NULL,
  firm_nr            VARCHAR(10) NOT NULL,
  scope              VARCHAR(32) NOT NULL,
  last_success_at    TIMESTAMPTZ,
  last_watermark_at  TIMESTAMPTZ,
  sync_mode          VARCHAR(16) NOT NULL DEFAULT 'incremental',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, firm_nr, scope)
);

CREATE INDEX IF NOT EXISTS idx_device_sync_cursor_device_firm
  ON public.device_sync_cursor (device_id, firm_nr);

CREATE TABLE IF NOT EXISTS public.device_sync_transfer_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id          TEXT NOT NULL,
  firm_nr            VARCHAR(10) NOT NULL,
  store_id           UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  terminal_name      VARCHAR(100),
  direction          VARCHAR(20) NOT NULL,
  sync_mode          VARCHAR(16) NOT NULL DEFAULT 'incremental',
  status             VARCHAR(20) NOT NULL DEFAULT 'ok',
  record_count       INTEGER NOT NULL DEFAULT 0,
  inserted_count     INTEGER NOT NULL DEFAULT 0,
  updated_count      INTEGER NOT NULL DEFAULT 0,
  skipped_count      INTEGER NOT NULL DEFAULT 0,
  failed_count       INTEGER NOT NULL DEFAULT 0,
  price_change_count INTEGER NOT NULL DEFAULT 0,
  watermark_from     TIMESTAMPTZ,
  watermark_to       TIMESTAMPTZ,
  table_breakdown    JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_changes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  message            TEXT,
  detail             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_sync_transfer_log_device_created
  ON public.device_sync_transfer_log (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_sync_transfer_log_firm_created
  ON public.device_sync_transfer_log (firm_nr, created_at DESC);

COMMENT ON TABLE public.device_sync_transfer_log IS 'Hibrit senkron aktarım günlüğü — cihaz bazında hızlı tespit';
COMMENT ON TABLE public.device_sync_cursor IS 'Cihaz/firma/kapsam son başarılı senkron watermark';

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
        AND t.updated_at >= %L::timestamptz
        ORDER BY t.updated_at ASC NULLS LAST
        LIMIT %s
        $q$,
        v_firm_padded,
        v_table.tablename,
        v_table.tablename,
        v_table.tablename,
        p_changed_since,
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT SELECT, INSERT, UPDATE ON public.device_sync_cursor TO anon;
    GRANT SELECT, INSERT ON public.device_sync_transfer_log TO anon;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
