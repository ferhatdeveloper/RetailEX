-- QR misafir UI teması: premium (varsayılan) | classic (eski Qrmenusystemsaas stili)
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
      'ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS guest_ui_theme VARCHAR(20) DEFAULT ''premium''',
      r.tbl
    );
    EXECUTE format(
      'UPDATE rest.%I SET guest_ui_theme = ''premium'' WHERE guest_ui_theme IS NULL OR guest_ui_theme = ''''',
      r.tbl
    );
  END LOOP;
END
$mig$;
