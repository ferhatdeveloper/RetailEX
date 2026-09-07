-- QR sipariş onay modu: manual = adisyona yazılmaz (onay sonrası), auto = hemen yazılır
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
      AND c.relname LIKE '%\_qr\_settings' ESCAPE '\'
  LOOP
    EXECUTE format(
      'ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS order_approval_mode VARCHAR(20) DEFAULT ''manual''',
      r.tbl
    );
    EXECUTE format(
      'UPDATE rest.%I SET order_approval_mode = ''manual'' WHERE order_approval_mode IS NULL',
      r.tbl
    );
  END LOOP;
END
$mig$;
