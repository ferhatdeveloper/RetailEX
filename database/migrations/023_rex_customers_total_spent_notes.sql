-- ============================================================================
-- 023: rex_*_customers — güzellik / CRM için total_spent ve notes kolonları
--      (beautyService.getCustomers vb. sorgular bu alanları bekliyor)
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS total_spent DECIMAL(15,2) DEFAULT 0', r.tablename);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS notes TEXT', r.tablename);
  END LOOP;
END $$;
