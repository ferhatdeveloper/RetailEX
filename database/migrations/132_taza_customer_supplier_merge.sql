-- RetailEX kasap DB — TAZA müşteri/tedarikçi tam birleştirme
-- Tarih: 2026-08-29
-- Yedek: database/backups/retailex_kasap_pre_132_*.dump
--
-- Önceki migration'lar:
--   130: Duplicate kayıtlar silindi (müşteri tarafında)
--   131: TED-002 bakiyesinden 780,553.75 + 335,556.25 düşüldü → 6,293,803.75 (not eklendi)
--        Sonrasında yeni işlemler bakiyeyi 7,409,913.75'e çıkardı (gerçek değer).
--   Not: schema_migrations tablosuna 130 ve 131 kaydedilmemiş (geçmişe dönük eklenecek).
--
-- Mevcut orphan duplicate:
--   - rex_001_suppliers.MUS-014 TAZA MRESHK (4932328e-b7b6-464b-9384-d4083546b1f3)
--     → bu ID customer tablosunda yok (silinmişti) ama supplier tablosunda unutulmuş.
--     → 10 adet sales satırı bu ID'ye bağlı (yanlışlıkla supplier_id değil customer_id olarak).
--
-- Senaryo: Müşteri/tedarikçi ayrımı korunarak orphan duplicate temizliği.
--   1. MUS-014 supplier ID'sine bağlı 10 sales satırı → customer_id = MUS-019 müşteri
--      (aynı kişi: TAZA MRESHK; yanlışlıkla supplier tablosuna müşteri ID'si olarak yazılmış).
--   2. MUS-014 supplier (941,582.50 bakiye) → orphan sil.
--      Bakiye müşteri MUS-019 zaten aynı tutarda; bilanço korunur (sadece tablo değişir).
--   3. MUS-019 müşteri (TAZA MRESHK, 941,582.50) → KALIR.
--   4. TED-002 supplier (TAZA, 7,409,913.75) → KALIR.
--   5. schema_migrations: 130, 131, 132 geçmişe dönük kayıt.
--
-- Sonuç:
--   - Customers: MUS-002 BADIA (inactive), MUS-009 TAZA (inactive),
--                MUS-019 TAZA MRESHK (active, 16 satış birleşik, bakiye 941,582.50)
--   - Suppliers: TED-002 TAZA (active, 7,409,913.75), TED-005 BADIA (active, 7,574,270)
--   - Duplicate: SIFIR
--   - Veri kaybı: YOK (16 satışın tamamı korunur)

BEGIN;

-- ============================================================
-- BÖLÜM 1: MUS-014 supplier orphan satışları → MUS-019 müşteriye yönlendir
-- ============================================================

-- 10 adet sales satırı MUS-014 supplier ID'sine bağlı (yanlışlıkla customer_id olarak yazılmış)
-- Bunlar aslında TAZA MRESHK'in müşteri satışları; MUS-019 müşteriye bağlanmalı.
UPDATE rex_001_01_sales
   SET customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid,
       customer_name = 'TAZA MRESHK'
 WHERE customer_id = '4932328e-b7b6-464b-9384-d4083546b1f3'::uuid;

-- account_movements ve diğer hareket tablolarında MUS-014 var mı? (kontrol amaçlı - 0 olmalı)
-- Eğer varsa da MUS-019'a yönlendir:
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- account_movements.customer_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='rex_001_01_account_movements' AND column_name='customer_id') THEN
    UPDATE rex_001_01_account_movements
       SET customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid
     WHERE customer_id = '4932328e-b7b6-464b-9384-d4083546b1f3'::uuid;
  END IF;

  -- cash_lines.customer_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='rex_001_01_cash_lines' AND column_name='customer_id') THEN
    UPDATE rex_001_01_cash_lines
       SET customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid
     WHERE customer_id = '4932328e-b7b6-464b-9384-d4083546b1f3'::uuid;
  END IF;

  -- bank_lines.customer_id
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='rex_001_01_bank_lines' AND column_name='customer_id') THEN
    UPDATE rex_001_01_bank_lines
       SET customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid
     WHERE customer_id = '4932328e-b7b6-464b-9384-d4083546b1f3'::uuid;
  END IF;
END $$;

-- ============================================================
-- BÖLÜM 2: MUS-014 supplier orphan sil
-- ============================================================
-- Bakiye 941,582.50 → MUS-019 müşteri zaten aynı tutar (bilanço korunur)
-- Bakiye not'u eklensin
UPDATE rex_001_customers
   SET notes = COALESCE(notes, '') ||
               E'\n[2026-08-29] Orphan supplier MUS-014 (TAZA MRESHK, 941,582.50) bu müşteriyle birleştirildi. '||
               '10 eski satış bu müşteriye yönlendirildi.'
 WHERE id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b'::uuid;

DELETE FROM rex_001_suppliers
 WHERE id = '4932328e-b7b6-464b-9384-d4083546b1f3'::uuid;

-- ============================================================
-- BÖLÜM 3: schema_migrations geçmişe dönük kayıtlar
-- ============================================================
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES
  ('130_cari_merge_kasap_duplicates.sql', '2026-08-29 22:00:00+00'),
  ('131_cari_merge_balance_transfer.sql', '2026-08-29 22:00:00+00'),
  ('132_taza_customer_supplier_merge.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- SELECT name, COUNT(*) FROM rex_001_customers GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1;
-- SELECT name, COUNT(*) FROM rex_001_suppliers GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1;
-- SELECT code, name, balance, is_active FROM rex_001_customers WHERE LOWER(name) LIKE '%taza%' ORDER BY code;
-- SELECT code, name, balance, is_active FROM rex_001_suppliers WHERE LOWER(name) LIKE '%taza%' ORDER BY code;
-- SELECT COUNT(*) FROM rex_001_01_sales WHERE customer_id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b';
