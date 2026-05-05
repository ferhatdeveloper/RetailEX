-- ============================================================================
-- 032: Beauty specialists - urun satisi icin adet basi sabit prim alani
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_specialists$'
  LOOP
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS product_unit_commission DECIMAL(15,2) NOT NULL DEFAULT 0',
      r.tablename
    );
  END LOOP;
END $$;
