-- =====================================================================
-- RetailEX migration #138 — BADIA (TED-005 / MUS-002) orphan yönlendirme
-- Tarih         : 2026-09-01
-- Veritabanı    : kasap (PG 15+)
-- Tetikleyen    : Kullanıcı "kasap datasında ödeme yapıyorum tedarikçiden
--                 düşüm yapmıyor ornek BEDIA firması" — müşteri listesine
--                 yanlışlıkla yazılan CH_ODEME tedarikçi bakiyesini
--                 etkilemiyordu.
--
-- Öncesi durum (138 öncesi):
--   customers.MUS-002 (de157885-...)  BADIA  balance 2,307,000.00
--   suppliers.TED-005 (0807abd4-...)  BADIA  balance 7,574,270.00
--   rex_001_01_cash_lines:
--     787a70f2  2026-09-01  amount=2,307,000  CH_ODEME
--                customer_id=de157885 (MUS-002)   party_id=NULL
--                definition="Ödeme: TED-005 - BADIA"
--   rex_001_01_sales (7 satır): customer_name='BADIA', customer_id NULL
--
-- Senaryo:
--   1) Bugünkü yanlış yazılan cash_line (787a70f2):
--      - customers.balance -2,307,000 (geri al)
--      - cash_line.party_id = TED-005 UUID (0807abd4)
--      - cash_line.customer_id NULL
--   2) Orphan sales (7 satır): customer_name='BADIA' olanları TED-005 ile
--      customer_id üzerinden bağla → satır sayısı 0'dan 7'ye çıksın
--   3) customers.MUS-002 BADIA duplicate kaydını sil (orphan, bakiyesi 0)
--   4) schema_migrations kaydı (idempotent)
--   5) Sync queue'daki stale event'leri sil (134 / 136 ile aynı desen)
--
-- GÜVENLİK:
--   - SET LOCAL session_replication_role = replica → AFTER trigger tetiklenmesin
--   - SET LOCAL retailex.sync_apply = '1' → trigger sync_queue'ya yazma
--   - Idempotent: WHERE bakiye = X koşulu ile sadece eski halindeyken çalış
--   - Stale event sil + bakiye update tek transaction'da
-- =====================================================================

BEGIN;

-- Tetikleyici güvenli bypass
SET LOCAL session_replication_role = replica;
SET LOCAL retailex.sync_apply = '1';

-- -----------------------------------------------------------------
-- 0. Önce durum kontrolü: BADIA gerçekten duplicate mi?
-- -----------------------------------------------------------------
DO $$
DECLARE
  v_cust_uuid UUID;
  v_supp_uuid UUID;
  v_cust_balance NUMERIC;
  v_supp_balance NUMERIC;
  v_bad_cashline_count INT;
  v_orphan_sales_count INT;
BEGIN
  SELECT id, balance INTO v_cust_uuid, v_cust_balance
    FROM rex_001_customers WHERE code='MUS-002' AND LOWER(name)='badia';
  SELECT id, balance INTO v_supp_uuid, v_supp_balance
    FROM rex_001_suppliers WHERE code='TED-005' AND LOWER(name)='badia';

  SELECT COUNT(*) INTO v_bad_cashline_count
    FROM rex_001_01_cash_lines
   WHERE customer_id = v_cust_uuid
     AND UPPER(TRIM(transaction_type)) = 'CH_ODEME';

  SELECT COUNT(*) INTO v_orphan_sales_count
    FROM rex_001_01_sales
   WHERE LOWER(TRIM(customer_name)) = 'badia'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled, false) = false
     AND fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance');

  RAISE NOTICE 'Öncesi durum:';
  RAISE NOTICE '  customers.MUS-002 uuid=% balance=%', v_cust_uuid, v_cust_balance;
  RAISE NOTICE '  suppliers.TED-005 uuid=% balance=%', v_supp_uuid, v_supp_balance;
  RAISE NOTICE '  Müşteriye yazılmış yanlış CH_ODEME sayısı: %', v_bad_cashline_count;
  RAISE NOTICE '  Orphan BADIA sales sayısı: %', v_orphan_sales_count;

  -- Doğrulama: iki UUID de var olmalı ve farklı olmalı
  IF v_cust_uuid IS NULL OR v_supp_uuid IS NULL THEN
    RAISE EXCEPTION 'BADIA duplicate değil veya zaten düzeltilmiş; migration atlanabilir';
  END IF;
  IF v_cust_uuid = v_supp_uuid THEN
    RAISE EXCEPTION 'BADIA aynı UUID — duplicate değil, farklı sorun';
  END IF;
END $$;

-- -----------------------------------------------------------------
-- 1. Bugünkü yanlış cash_line'ı (787a70f2) müşteri bakiyesinden geri al
--    ve party_id kolonuna doğru tedarikçi UUID'sini yaz.
--    amount sign +1 (kasa çıkış) idi; müşteri borç artmıştı (-amt yönünde
--    değil, +amt yönünde — bu yüzden balance = +2,307,000).
--    Cari yönü: customer + CH_ODEME → +amt (cariCashLineLedgerContrib).
--    Geri almak için: customers.balance -2,307,000.
-- -----------------------------------------------------------------
DO $$
DECLARE
  v_cust_uuid UUID;
  v_supp_uuid UUID;
  v_cust_balance NUMERIC;
  v_amount NUMERIC;
BEGIN
  SELECT id, balance INTO v_cust_uuid, v_cust_balance
    FROM rex_001_customers WHERE code='MUS-002' AND LOWER(name)='badia';
  SELECT id INTO v_supp_uuid
    FROM rex_001_suppliers WHERE code='TED-005' AND LOWER(name)='badia';

  -- Müşteri bakiyesini eski haline getir (yanlış yazılan ödemeyi geri al)
  -- idempotent: balance = 2,307,000 ise geri al
  IF v_cust_balance = 2307000.00 THEN
    UPDATE rex_001_customers
       SET balance = 0,
           notes = COALESCE(notes, '') ||
                   E'\n[2026-09-01] Migration 138: Bugünkü yanlış CH_ODEME (2,307,000) '
                   || 'buradan geri alındı; tedarikçi TED-005''e yeniden yazıldı.',
           updated_at = NOW()
     WHERE id = v_cust_uuid;
    RAISE NOTICE 'Müşteri bakiyesi 0''a çekildi (geri alındı)';
  ELSE
    RAISE NOTICE 'Müşteri bakiyesi % — geri alma koşulu eşleşmedi, atlandı', v_cust_balance;
  END IF;

  -- 787a70f2 nolu cash_line: customer_id → NULL, party_id → TED-005 UUID
  -- rex_001_01_cash_lines'da updated_at kolonu yok; updated_at set etmiyoruz
  UPDATE rex_001_01_cash_lines
     SET customer_id = NULL,
         party_id = v_supp_uuid
   WHERE customer_id = v_cust_uuid
     AND UPPER(TRIM(transaction_type)) = 'CH_ODEME'
     AND ABS(amount) = 2307000.00;

  GET DIAGNOSTICS v_amount = ROW_COUNT;
  RAISE NOTICE 'Cash_line güncellendi (customer_id NULL, party_id=supplier_uuid): % satır', v_amount;
END $$;

-- -----------------------------------------------------------------
-- 2. Tedarikçi bakiyesini güncelle (ödeme tedarikçi tarafına düşsün)
--    Tedarikçi + CH_ODEME → -amt (borç azalır). 7,574,270 - 2,307,000 = 5,267,270
--    Idempotent: balance IN (eski_değerler) koşulu
-- -----------------------------------------------------------------
UPDATE rex_001_suppliers
   SET balance = balance - 2307000.00,
       notes = COALESCE(notes, '') ||
               E'\n[2026-09-01] Migration 138: Bugünkü 2,307,000 IQD CH_ODEME '
               || '(cash_line 787a70f2) bu tedarikçiye doğru şekilde uygulandı.',
       updated_at = NOW()
 WHERE code = 'TED-005' AND LOWER(name) = 'badia'
   AND balance = 7574270.00;

-- -----------------------------------------------------------------
-- 3. Orphan sales satırlarını TED-005 ile bağla (customer_id)
--    7 satır purchase_invoice var; total 11,853,969.70
--    Bunlar ledger CTE'nin isim eşleşmesi blokuna düşüyordu;
--    customer_id bağlanırsa doğrudan ID üzerinden eşleşir
-- -----------------------------------------------------------------
DO $$
DECLARE
  v_supp_uuid UUID;
  v_updated INT;
BEGIN
  SELECT id INTO v_supp_uuid FROM rex_001_suppliers WHERE code='TED-005' AND LOWER(name)='badia';

  UPDATE rex_001_01_sales
     SET customer_id = v_supp_uuid,
         updated_at = NOW()
   WHERE LOWER(TRIM(customer_name)) = 'badia'
     AND customer_id IS NULL
     AND COALESCE(is_cancelled, false) = false
     AND fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Orphan BADIA sales → customer_id=supplier_uuid bağlandı: % satır', v_updated;
END $$;

-- -----------------------------------------------------------------
-- 4. customers.MUS-002 BADIA kaydını sil (orphan duplicate, bakiye 0)
--    Idempotent: balance = 0 olduğunda sil (aksi halde atla)
-- -----------------------------------------------------------------
DELETE FROM rex_001_customers
 WHERE code = 'MUS-002' AND LOWER(name) = 'badia' AND balance = 0;

-- -----------------------------------------------------------------
-- 5. Sync queue stale event'lerini sil (kalıcı revert engeli)
-- -----------------------------------------------------------------
DELETE FROM sync_queue
 WHERE record_id = 'de157885-6c31-4562-9a3a-51b843d6898f'
   AND status = 'pending';

-- -----------------------------------------------------------------
-- 6. schema_migrations kaydı (idempotent)
-- -----------------------------------------------------------------
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('138_badia_orphan_supplier_redirect.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- =====================================================================
-- DOĞRULAMA (psql ayrı çalıştırılabilir)
-- =====================================================================
-- -- 1) customers.MUS-002 artık yok
-- SELECT count(*) FROM rex_001_customers WHERE code='MUS-002' AND LOWER(name)='badia';
-- -- Beklenen: 0
--
-- -- 2) suppliers.TED-005 yeni bakiye
-- SELECT balance FROM rex_001_suppliers WHERE code='TED-005' AND LOWER(name)='badia';
-- -- Beklenen: 7574270 - 2307000 = 5267270.00
--
-- -- 3) cash_line 787a70f2 doğru tabloya yazıldı
-- SELECT customer_id, party_id FROM rex_001_01_cash_lines WHERE id='787a70f2-bd0b-468c-960e-641805d8f8de';
-- -- Beklenen: customer_id=NULL, party_id=0807abd4-...
--
-- -- 4) Orphan sales artık customer_id bağlı
-- SELECT count(*) FROM rex_001_01_sales
--  WHERE LOWER(TRIM(customer_name)) = 'badia' AND customer_id IS NOT NULL;
-- -- Beklenen: 7
--
-- -- 5) Tedarikçi bakiye CTE'si ile hesaplanan
-- -- (sqlSupplierAccountBalancesCte fonksiyonunun döndürdüğü değer)
-- SELECT s.code, s.name, s.balance AS kart,
--        COALESCE(SUM(
--          CASE WHEN sl.fiche_type='purchase_invoice' THEN sl.net_amount
--               WHEN sl.fiche_type='return_invoice' THEN -sl.net_amount
--               WHEN sl.fiche_type='opening_balance' THEN sl.net_amount
--               ELSE 0 END
--        ), 0) AS fatura_toplam,
--        COALESCE((SELECT SUM(CASE WHEN UPPER(TRIM(transaction_type))='CH_ODEME' THEN -ABS(amount)
--                                  WHEN UPPER(TRIM(transaction_type))='CH_TAHSILAT' THEN ABS(amount)
--                                  ELSE 0 END)
--                    FROM rex_001_01_cash_lines
--                   WHERE (party_id = s.id OR (customer_id = s.id AND UPPER(TRIM(transaction_type))='CH_ODEME'))
--                ), 0) AS odeme_toplam
--   FROM rex_001_suppliers s
--  WHERE s.code='TED-005'
--  GROUP BY s.id, s.code, s.name, s.balance;
-- -- Beklenen: kart 5,267,270 ; fatura 11,853,969.70 ; ödeme -2,307,000 ;
-- -- hesaplanan = fatura + ödeme = 9,546,969.70 (henüz eksik ödemeler var)
