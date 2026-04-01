-- Açık adisyonda sipariş düzeyi indirim (%) — ön fiş sonrası ve senkronizasyonda korunur; masa kapanınca sıfırlanır
DO $mig$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'rest'
      AND c.relkind = 'r'
      AND c.relname LIKE '%\_rest\_orders' ESCAPE '\'
      AND c.relname NOT LIKE '%\_kitchen\_orders' ESCAPE '\'
  LOOP
    EXECUTE format(
      'ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS order_discount_pct DECIMAL(5,2) DEFAULT 0',
      r.tbl
    );
  END LOOP;
END
$mig$;
