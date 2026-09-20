-- 159: müşteri arama planı — arayan kullanıcı
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
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_plan_caller_user_id UUID',
      r.tablename
    );
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS call_plan_caller_name TEXT',
      r.tablename
    );
  END LOOP;
END $$;

ALTER TABLE IF EXISTS public.customer_call_plan_weekly
  ADD COLUMN IF NOT EXISTS call_plan_caller_user_id UUID;
ALTER TABLE IF EXISTS public.customer_call_plan_weekly
  ADD COLUMN IF NOT EXISTS call_plan_caller_name TEXT;

NOTIFY pgrst, 'reload schema';
