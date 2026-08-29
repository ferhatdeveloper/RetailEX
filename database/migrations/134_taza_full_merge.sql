-- =====================================================================
-- RetailEX migration #134 — TED-002 (TAZA) + MUS-019 (TAZA MRESHK) tam birleştirme
-- Tarih         : 2026-08-29
-- Veritabanı    : kasap (PG 15+)
-- Tetikleyen    : Kullanıcı "ikisini de birleştir" — tek TED-002 primary'sinde
-- Öncesi durum  :
--   customers.MUS-019 (b81fe06f)  TAZA MRESHK  balance  941,582.50   is_active=f (orphan, temizlendi)
--   suppliers.MUS-019 (99bb12af)  TAZA MRESHK  balance  941,582.50   is_active=t
--   suppliers.TED-002 (5bb0a60b)  TAZA         balance 7,409,913.75   is_active=t (PRIMARY)
--   rex_001_01_sales (16 purchase_invoice) customer_id zaten NULL
-- Hesaplanan    :
--   TED-002 yeni balance = 7,409,913.75 + 941,582.50 = 8,351,496.25
--   Silinen cariler  : customers.MUS-019, suppliers.MUS-019 (orphan MUS-014 değil — ayrıydı)
--   Veri kaybı       : 0 (16 satış customer_name ile yerelde)
-- ============================================================--
BEGIN;

-- -----------------------------------------------------------------
-- 1. TED-002 TAZA hesabına MUS-019 bakiyesini ekle (941,582.50)
-- -----------------------------------------------------------------
UPDATE rex_001_suppliers
SET balance       = 7409913.75 + 941582.50,   -- = 8,351,496.25
    notes         = COALESCE(notes, '') ||
                    E'\n[2026-08-29] Birleştirme: customers.MUS-019 (TAZA MRESHK, 941,582.50 IQD) ve suppliers.MUS-019 (TAZA MRESHK, 941,582.50 IQD) tek TED-002 primary (TAZA) altında toplandı. Yeni bakiye 8,351,496.25 IQD.',
    updated_at    = NOW()
WHERE id = '5bb0a60b-feec-449a-94f4-baa07d42e867';

-- -----------------------------------------------------------------
-- 2. suppliers.MUS-019 (99bb12af) kaydını sil — duplicate, bakiyesi
--    TED-002'ye aktarıldı
-- -----------------------------------------------------------------
DELETE FROM rex_001_suppliers
WHERE id = '99bb12af-03bb-40cd-ac92-dea819dd99b5';

-- -----------------------------------------------------------------
-- 3. customers.MUS-019 (b81fe06f) kaydını sil — orphan müşteri,
--    bakiyesi TED-002'ye aktarıldı (yukarıda)
-- -----------------------------------------------------------------
DELETE FROM rex_001_customers
WHERE id = 'b81fe06f-682d-44d8-98a2-d9ee3c49be8b';

-- -----------------------------------------------------------------
-- 4. TAZA bakiye = 8,351,496.25 IQD olduğunu doğrula (raise notice)
-- -----------------------------------------------------------------
DO $$
DECLARE v_balance numeric;
BEGIN
  SELECT balance INTO v_balance
  FROM rex_001_suppliers
  WHERE id = '5bb0a60b-feec-449a-94f4-baa07d42e867';

  IF v_balance <> 8351496.25 THEN
    RAISE EXCEPTION 'Beklenen TED-002 bakiye 8351496.25, gerçek %', v_balance;
  END IF;
  RAISE NOTICE 'TED-002 (TAZA) bakiye doğrulandı: % IQD', v_balance;
END $$;

COMMIT;
