-- Personel işten çıkış tarihi (parties employee)
-- Hakkediş: çıkış ayından sonraki aylar yazılmaz; çıkış ayında gün oranlı.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^rex_[0-9]+_parties$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS termination_date DATE',
      r.tablename
    );
  END LOOP;
END $$;
