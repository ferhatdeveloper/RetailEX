-- ============================================================================
-- 041: Eksik beauty.rex_{firm}_follow_up_reminder_actions tablolarını oluştur
-- 037 yalnızca o anda var olan beauty_services tablolarına bakıyordu; bu dosya
-- public.firms ve mevcut tüm rex_*_beauty_services kayıtları için tabloyu garanti eder.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_actions TEXT;
  v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_services$'
  LOOP
    v_actions := regexp_replace(r.tablename, '_beauty_services$', '_follow_up_reminder_actions');
    IF v_actions = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_actions);

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

  FOR r IN
    SELECT DISTINCT TRIM(firm_nr::text) AS firm_nr
    FROM public.firms
    WHERE firm_nr IS NOT NULL AND TRIM(firm_nr::text) <> ''
  LOOP
    v_actions := lower('rex_' || r.firm_nr || '_follow_up_reminder_actions');
    IF v_actions = ANY (v_seen) THEN
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_actions);

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

  v_actions := 'rex_001_follow_up_reminder_actions';
  IF NOT (v_actions = ANY (v_seen)) AND to_regclass('beauty.' || quote_ident(v_actions)) IS NULL THEN
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
  END IF;
END $$;
