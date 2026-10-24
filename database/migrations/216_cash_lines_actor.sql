-- Kasa satırına ekleyen kişi.
-- cashier: ekranda görünen ad. created_by_user_id: kullanıcı kimliği.
-- Eski satırlara ad yazılmaz; kolonlar boş kalır.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cashier VARCHAR(120)',
      r.tbl
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by_user_id UUID',
      r.tbl
    );
  END LOOP;
END $$;
