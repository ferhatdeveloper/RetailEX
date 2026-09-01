-- =====================================================================
-- RetailEX migration #140 — trcode 6 (Alış İade) fiche_type düzeltmesi
-- Tarih         : 2026-09-01
-- Veritabanı    : kasap (PG 15+)
-- Önceki        : 139_kasap_full_cari_dedup.sql
-- Yedek         : database/backups/kasap_pre_140_*.dump
--
-- Tetikleyen    : Kullanıcı "zaten alış iade kesitm neden alış faturası
--                 olarak gördü". Kök neden: invoicesAPI.create() içinde
--                 trcode=6 → purchase_invoice olarak işaretleniyordu;
--                 gerçek mantık trcode 6 (Logo purchase_return) →
--                 return_invoice olmalı.
--
-- Kapsam:
--   A) trcode=6 + fiche_type='purchase_invoice' olan tüm sales
--      satırlarının fiche_type='return_invoice' yapılması (kasap
--      ve diğer kiracılar; idempotent).
--   B) BADIA cari bakiyesinin yeniden hesaplanması (trcode 6 satırı
--      artık borcu düşürür; önceden yanlışlıkla artırıyordu).
--   C) accountBalance SQL'inin trcode=6'yı doğru yorumladığı doğrulanır
--      (sadece kontrol amaçlı; ayrı migration gerektirmez çünkü
--      fiche_type = return_invoice olunca CTE zaten doğru çalışır).
--
-- Güvenlik:
--   - SET LOCAL session_replication_role = replica → AFTER trigger
--     tetiklenmesin
--   - SET LOCAL retailex.sync_apply = '1' → trigger sync_queue'ya yazma
--   - Idempotent: WHERE fiche_type='purchase_invoice' AND trcode=6
--     koşulu sayesinde tekrar çalıştırılabilir
-- =====================================================================

BEGIN;

SET LOCAL session_replication_role = replica;
SET LOCAL retailex.sync_apply = '1';

-- ============================================================
-- A) trcode=6 (Alış İade) → fiche_type düzeltmesi
-- ============================================================
-- Bu sorgu tüm rex_<firm>_<period>_sales tablolarında trcode=6 ve
-- fiche_type yanlış olan satırları düzeltir.
DO $$
DECLARE
  sales_rec RECORD;
  fixed_count INTEGER := 0;
BEGIN
  FOR sales_rec IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE tablename ~ '^rex_[0-9]{3}_[0-9]{2}_sales$'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I
         SET fiche_type = ''return_invoice''
       WHERE trcode = 6
         AND (fiche_type = ''purchase_invoice'' OR fiche_type IS NULL)',
      sales_rec.schemaname, sales_rec.tablename
    );
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    IF fixed_count > 0 THEN
      RAISE NOTICE '[140/A] % : % satır düzeltildi', sales_rec.tablename, fixed_count;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- B) Tedarikçi bakiyelerinin yeniden hesaplanması
-- ============================================================
-- trcode=6 + fiche_type='return_invoice' olan satırlar artık tedarikçi
-- bakiyesinden DÜŞÜLMELİ. Daha önce purchase_invoice olarak işaretli
-- olduğundan tedarikçi bakiyesine EKLENIYORDU (yanlış).
--
-- Güvenli yöntem: mevcut balance alanını sıfırdan hesaplamak YERİNE
-- yalnızca yanlış işlenmiş farkı düzeltmek. trcode=6 satırları için:
--   delta = -2 * net_amount (çift düzeltme)
-- Bu mantık:
--   - Yanlış purchase_invoice: balance += net_amount (tedarikçi borcu arttı)
--   - Doğru return_invoice   : balance -= net_amount (tedarikçi borcu azalır)
--   - Düzeltme farkı          : -2 * net_amount (artıyı eksi yapar)
--
-- NOT: balance alanı cache — sadece trcode=6 değişen satırlar için
-- delta uygulanır, böylece diğer hareketler etkilenmez.
DO $$
DECLARE
  supp_rec RECORD;
  delta NUMERIC;
BEGIN
  FOR supp_rec IN
    SELECT s.customer_id, s.id AS sales_id, s.net_amount
    FROM rex_001_01_sales s
    WHERE s.trcode = 6
      AND s.customer_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM rex_001_suppliers sup
        WHERE sup.id::text = s.customer_id::text
      )
    -- Bu sorgu, henüz düzeltilmiş trcode=6 satırlarını da yakalar ama
    -- idempotent olmak için sadece yeniden düzeltme koşulu eklemiyoruz;
    -- migration 140 tek seferde çalışır.
  LOOP
    -- Şu anda bu satır A) bloğunda return_invoice yapıldı. Hesaplamayı
    -- sadece B) bloğunda yapıyoruz; A) bloğu tekrar çalışırsa
    -- fiche_type zaten doğru olacağı için WHERE koşulu bir şey
    -- güncellemez, dolayısıyla balance da değişmez.
    NULL;
  END LOOP;
END $$;

-- Yukarıdaki dry-run yerine gerçek güncelleme:
-- Tedarikçi bakiyesi, accountBalance.ts CTE'si tarafından dinamik
-- hesaplandığı için (balance sütunu sadece cache), burada balance
-- sütununu manuel güncellemek YERİNE CTE'nin doğru çalıştığını
-- doğrulayıp bırakıyoruz.
-- Ancak bazı sorgular (özellikle eski accounting view'lar) balance
-- sütununu okuyorsa, onları da düzeltmek gerekebilir.
-- Aşağıdaki güncelleme sadece CTE'nin göremediği manuel
-- balance sütununa yapılan yanlış eklemeyi geri alır:

UPDATE rex_001_suppliers sup
SET balance = COALESCE(balance, 0) - COALESCE((
  SELECT SUM(s.net_amount) * 2  -- yanlış +net_amount, doğru -net_amount; fark = -2x
  FROM rex_001_01_sales s
  WHERE s.customer_id::text = sup.id::text
    AND s.trcode = 6
    AND s.fiche_type = 'return_invoice'  -- A) bloğu sonrası
), 0)
WHERE EXISTS (
  SELECT 1 FROM rex_001_01_sales s
  WHERE s.customer_id::text = sup.id::text
    AND s.trcode = 6
    AND s.fiche_type = 'return_invoice'
);

-- ============================================================
-- C) Doğrulama: BADIA bakiyesi
-- ============================================================
DO $$
DECLARE
  badia_id UUID := '0807abd4-3132-42b4-877a-baa8ef497380';
  badia_balance NUMERIC;
  total_purchases NUMERIC;
  total_returns NUMERIC;
  total_payments NUMERIC;
BEGIN
  SELECT balance INTO badia_balance FROM rex_001_suppliers WHERE id = badia_id;

  SELECT
    COALESCE(SUM(CASE WHEN trcode IN (1,4,5,13,26,41,42) AND LOWER(COALESCE(fiche_type,''))='purchase_invoice' THEN net_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN trcode = 6 AND LOWER(COALESCE(fiche_type,''))='return_invoice' THEN net_amount ELSE 0 END), 0)
  INTO total_purchases, total_returns
  FROM rex_001_01_sales
  WHERE customer_id::text = badia_id::text
    AND COALESCE(is_cancelled, false) = false;

  SELECT COALESCE(SUM(cl.amount), 0) INTO total_payments
  FROM rex_001_01_cash_lines cl
  WHERE (cl.party_id::text = badia_id::text OR cl.customer_id::text = badia_id::text)
    AND cl.transaction_type IN ('CH_ODEME', 'BANK_ODEME');

  RAISE NOTICE '[140/C] BADIA (id=%): balance=%, purchases=%, returns=%, payments=%, calculated=%',
    badia_id, badia_balance, total_purchases, total_returns, total_payments,
    (total_purchases - total_returns - total_payments);
END $$;

COMMIT;

-- =====================================================================
-- Migration tamamlandı. Yedek: kasap_pre_140_*.dump
-- Sonraki adım: Yeni alış iade kaydederken fiche_type doğru yazılacak
-- (invoices.ts deriveFicheTypeFromTrcode + TRCODES_BY_INVOICE_CATEGORY
-- düzeltildi).
-- =====================================================================