-- ============================================================================
-- 037: Güzellik takip hatırlatması — not, erteleme, durum (takvim panosu)
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_actions TEXT;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_services$'
  LOOP
    v_actions := regexp_replace(r.tablename, '_beauty_services$', '_follow_up_reminder_actions');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS beauty.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr VARCHAR(10) NOT NULL,
        customer_id UUID NOT NULL,
        service_id UUID NOT NULL,
        product_id UUID,
        reminder_kind VARCHAR(20) NOT NULL DEFAULT ''service'',
        last_completed_date DATE NOT NULL,
        natural_due_date DATE NOT NULL,
        reminder_days INTEGER,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        service_name VARCHAR(255),
        product_name VARCHAR(255),
        status VARCHAR(30) NOT NULL DEFAULT ''due'',
        postponed_due_date DATE,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )',
      v_actions
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON beauty.%I (
        customer_id, service_id, COALESCE(product_id, ''00000000-0000-0000-0000-000000000000''::uuid),
        last_completed_date, natural_due_date, reminder_kind
      )',
      v_actions || '_uniq',
      v_actions
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (postponed_due_date)',
      v_actions || '_postponed_idx',
      v_actions
    );
  END LOOP;
END $$;
