-- create_firm_tables / CREATE_FIRM_TABLES: APPLY_SYNC_TRIGGERS eksikse 42883 hatası
-- Eski kurulumlarda 060 uygulanmış, 000 içindeki sync fonksiyonları yoksa firma tabloları oluşmaz.

CREATE TABLE IF NOT EXISTS public.sync_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name     VARCHAR(100) NOT NULL,
  record_id      UUID NOT NULL,
  action         VARCHAR(20) NOT NULL,
  firm_nr        VARCHAR(10) NOT NULL,
  data           JSONB,
  status         VARCHAR(20) DEFAULT 'pending',
  synced_at      TIMESTAMPTZ,
  retry_count    INTEGER DEFAULT 0,
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

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

CREATE OR REPLACE FUNCTION public.apply_sync_triggers(p_table_name TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I ON %I; CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE PROCEDURE public.enqueue_sync_event();',
    'sync_trg_' || p_table_name, p_table_name, 'sync_trg_' || p_table_name, p_table_name
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.try_apply_sync_triggers(p_table_name TEXT)
RETURNS void AS $$
BEGIN
  BEGIN
    PERFORM public.apply_sync_triggers(p_table_name);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLSTATE = '42883' THEN
        RETURN;
      END IF;
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
