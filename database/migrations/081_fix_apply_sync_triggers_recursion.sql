-- PG: APPLY_SYNC_TRIGGERS ve apply_sync_triggers ayni isim (lowercase) — wrapper gercek govdeyi ezip
-- PERFORM apply_sync_triggers(...) sonsuz dongu (54001 stack depth) yaratiyordu.

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
