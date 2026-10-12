-- Migration 212: sale_items tablosuna linked_appointment_id kolonu
-- Amaç: Randevu tamamlandığında REZARVASYON HİZMETİ satırının hangi randevuya
-- bağlı olduğunu kalıcı olarak işaretlemek ve aynı randevu için birden fazla
-- REZARVASYON HİZMETİ satırı eklenmesini engellemek (idempotency).
-- beautyService.appendReservationHizmetiLine() bu kolonu kontrol eder.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Mevcut DB'lere etki etmez, sadece kolonu garanti eder.

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname ~ '^rex_[0-9]+_[0-9]+_sale_items$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS linked_appointment_id uuid',
      v_rec.tbl
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (linked_appointment_id) WHERE linked_appointment_id IS NOT NULL',
      v_rec.tbl || '_linked_appt_idx',
      v_rec.tbl
    );
  END LOOP;
END $$;
