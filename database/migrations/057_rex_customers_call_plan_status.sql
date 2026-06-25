-- 057: rex_*_customers — müşteri arama planı notu ve son durum
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_plan_note TEXT', r.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_last_status VARCHAR(30) DEFAULT ''planned''', r.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_last_note TEXT', r.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_last_at TIMESTAMPTZ', r.tablename);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
