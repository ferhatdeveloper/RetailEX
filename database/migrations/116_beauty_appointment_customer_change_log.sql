-- ============================================================================
-- 116: Beauty — Randevu müşteri değişikliği audit log
-- ============================================================================
-- Yanlış müşteriye açılmış bir randevuda, operatörün müşteriyi
-- (cariden bağımsız olarak) hızlıca değiştirebilmesi için yeni bir tablo.
-- Eski müşteri kimliği, yeni müşteri kimliği, değiştiren kullanıcı
-- ve opsiyonel not bu tabloda iz bırakır; randevunun kendisi
-- güncellenirken aynı transaction içinde buraya INSERT yapılır.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'beauty' AND tablename ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS beauty.%I (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         appointment_id UUID NOT NULL,
         old_customer_id UUID,
         new_customer_id UUID NOT NULL,
         changed_by UUID,
         note TEXT,
         changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
       )',
      r.tablename || '_customer_changes'
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (appointment_id, changed_at DESC)',
      'idx_' || r.tablename || '_customer_changes_apt',
      r.tablename || '_customer_changes'
    );
  END LOOP;
END $$;
