-- Logo CLCARD senkronu: rex_*_customers / suppliers tablolarına ref_id (Logo LOGICALREF)

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
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS ref_id INTEGER',
      r.tablename
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
      r.tablename || '_ref_id_uidx',
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
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS ref_id INTEGER',
      r.tablename
    );
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (ref_id) WHERE ref_id IS NOT NULL',
      r.tablename || '_ref_id_uidx',
      r.tablename
    );
  END LOOP;
END $$;

-- PostgREST şema önbelleğini yenile (db-channel açıksa)
NOTIFY pgrst, 'reload schema';
