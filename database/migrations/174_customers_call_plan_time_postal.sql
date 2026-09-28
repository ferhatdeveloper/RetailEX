-- 174: müşteri arama planı — arama saati (call_plan_time) + posta kodu (postal_code)

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
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_plan_time TIME',
      r.tablename
    );
  END LOOP;

  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_suppliers$'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)',
      r.tablename
    );
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.customer_call_plan_weekly
  ADD COLUMN IF NOT EXISTS call_plan_time TIME;

NOTIFY pgrst, 'reload schema';
