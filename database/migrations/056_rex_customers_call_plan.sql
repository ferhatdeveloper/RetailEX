-- 056: rex_*_customers — haftalık müşteri arama planı
DO $$
DECLARE
  r RECORD;
  has_old_weekday BOOLEAN;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_plan_enabled BOOLEAN DEFAULT false', r.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_plan_weekdays SMALLINT[] DEFAULT ''{}''::smallint[]', r.tablename);
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = r.tablename
        AND column_name = 'call_plan_weekday'
    ) INTO has_old_weekday;
    IF has_old_weekday THEN
      EXECUTE format('UPDATE %I SET call_plan_weekdays = ARRAY[call_plan_weekday]::smallint[] WHERE call_plan_weekday BETWEEN 1 AND 7 AND COALESCE(array_length(call_plan_weekdays, 1), 0) = 0', r.tablename);
    END IF;
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS call_plan_weekday', r.tablename);
    EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS call_plan_note', r.tablename);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
