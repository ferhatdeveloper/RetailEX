-- 186_cash_lines_back_dated.sql
-- Geçmiş tarihe girilen kasa işlemleri için audit bayrağı.
-- `is_back_dated = true` → işlem tarihi (`date`), oluşturma tarihinden (`created_at`) veya
-- bugünden önce. UI'da "Geçmiş tarihe işlem giriyorum" onay kutusu zorunlu kılınır
-- ve bu kolon true olarak INSERT edilir. Audit trail + raporlama için kullanılır.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` ile birden fazla kez çalıştırılabilir.
-- Hem firm (`rex_{firmNr}_cash_lines`) hem dönem (`rex_{firmNr}_{periodNr}_cash_lines`)
-- tabloları için uygulanır.

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename ~ '^rex_[0-9]+_cash_lines$' OR tablename ~ '^rex_[0-9]+_[0-9]+_cash_lines$')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_back_dated BOOLEAN DEFAULT FALSE',
      v_rec.tablename
    );
  END LOOP;
END
$$;

-- 000_master_schema.sql CREATE_PERIOD_TABLES içindeki cash_lines CREATE ifadesinde
-- de bu kolon tanımlıdır (yeni firma/dönem açılışlarında otomatik gelir).