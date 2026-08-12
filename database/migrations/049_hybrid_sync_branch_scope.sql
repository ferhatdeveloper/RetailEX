-- Hibrit senkron: şube / kasiyer kapsamı ve oturum bağlamı

ALTER TABLE public.sync_queue
  ADD COLUMN IF NOT EXISTS source_store_id UUID REFERENCES public.stores(id),
  ADD COLUMN IF NOT EXISTS source_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS terminal_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sync_queue_source_store
  ON public.sync_queue (source_store_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_queue_source_user
  ON public.sync_queue (source_user_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.enqueue_sync_event()
RETURNS TRIGGER AS $$
DECLARE
  v_firm_nr       VARCHAR;
  v_record_id     UUID;
  v_data          JSONB;
  v_store_id      UUID;
  v_user_id       UUID;
  v_terminal      VARCHAR(100);
  v_cashier       VARCHAR(100);
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
      BEGIN v_store_id := OLD.store_id; EXCEPTION WHEN OTHERS THEN v_store_id := NULL; END;
      BEGIN v_cashier := OLD.cashier; EXCEPTION WHEN OTHERS THEN v_cashier := NULL; END;
    ELSE
      v_firm_nr := NEW.firm_nr; v_record_id := NEW.id; v_data := row_to_json(NEW)::JSONB;
      BEGIN v_store_id := NEW.store_id; EXCEPTION WHEN OTHERS THEN v_store_id := NULL; END;
      BEGIN v_cashier := NEW.cashier; EXCEPTION WHEN OTHERS THEN v_cashier := NULL; END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_firm_nr := '001';
    IF (TG_OP = 'DELETE') THEN
      v_record_id := OLD.id; v_data := row_to_json(OLD)::JSONB;
      BEGIN v_store_id := OLD.store_id; EXCEPTION WHEN OTHERS THEN v_store_id := NULL; END;
      BEGIN v_cashier := OLD.cashier; EXCEPTION WHEN OTHERS THEN v_cashier := NULL; END;
    ELSE
      v_record_id := NEW.id; v_data := row_to_json(NEW)::JSONB;
      BEGIN v_store_id := NEW.store_id; EXCEPTION WHEN OTHERS THEN v_store_id := NULL; END;
      BEGIN v_cashier := NEW.cashier; EXCEPTION WHEN OTHERS THEN v_cashier := NULL; END;
    END IF;
  END;

  BEGIN
    v_user_id := NULLIF(current_setting('retailex.user_id', true), '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NULL AND v_cashier IS NOT NULL AND v_cashier <> '' THEN
    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE (u.username = v_cashier OR u.full_name = v_cashier)
      AND (v_store_id IS NULL OR u.store_id = v_store_id)
    ORDER BY u.is_active DESC
    LIMIT 1;
  END IF;

  BEGIN
    IF v_store_id IS NULL THEN
      v_store_id := NULLIF(current_setting('retailex.store_id', true), '')::UUID;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_store_id := COALESCE(v_store_id, NULL);
  END;

  v_terminal := NULLIF(current_setting('retailex.terminal_name', true), '');

  UPDATE sync_queue
  SET data = v_data,
      action = TG_OP,
      firm_nr = v_firm_nr,
      source_store_id = COALESCE(v_store_id, source_store_id),
      source_user_id = COALESCE(v_user_id, source_user_id),
      terminal_name = COALESCE(v_terminal, terminal_name),
      created_at = NOW()
  WHERE table_name = TG_TABLE_NAME AND record_id = v_record_id AND status = 'pending';

  IF NOT FOUND THEN
    INSERT INTO sync_queue (
      table_name, record_id, action, firm_nr, data,
      source_store_id, source_user_id, terminal_name
    )
    VALUES (
      TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data,
      v_store_id, v_user_id, v_terminal
    );
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
