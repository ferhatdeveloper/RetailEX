-- ============================================================================
-- 034: Beauty hizmet — ana kategori (parent) + alt kategori (category)
-- parent_category doluysa: category = alt grup, parent_category = ana başlık
-- Boşsa: mevcut davranış (yalnızca category, tek seviye)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_beauty_services$'
  LOOP
    EXECUTE format(
      'ALTER TABLE beauty.%I ADD COLUMN IF NOT EXISTS parent_category VARCHAR(100)',
      r.tablename
    );
  END LOOP;
END $$;
