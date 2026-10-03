-- ============================================================================
-- Migration 198: Retail Customer bugün satışlarında ödeme tipini Nakit'e çevir
-- ----------------------------------------------------------------------------
-- Plan referansı: Kullanıcı talebi 2026-10-03 23:29 (UTC+3) — kasap DB
-- (srv1253122.hstgr.cloud, DB: kasap, firm 001 / period 01).
--
-- Sorun:
--   * `customer_name = 'Retail Customer'` olan ve bugün yapılmış 37 satış
--     yanlışlıkla `payment_method = 'veresiye'` olarak kaydedilmiş.
--   * Perakende müşteri (Retail Customer) nakit ödemeli; cari hesap
--     açılmamış, customer_id NULL, veresiye olarak işaretlenmesi iş
--     mantığına aykırı.
--   * Bu satışlar için `rex_001_01_cash_lines` KASA_GIRIS satırı hiç
--     oluşmamış (trigger `veresiye`'de erken çıkıyor); nakit olduğunda
--     kasa'ya yansımalı.
--
-- Neden gerekli:
--   * Perakende satışın gerçekte nakit alındığı varsayımıyla kasaya
--     yansıması.
--   * Raporlarda "Nakit" / "Veresiye" ayrımının doğru olması.
--   * Cari tarafı zaten etkilenmemiş (cari hesap YOK, customer_id NULL).
--
-- Kapsam:
--   * Yalnızca `rex_001_01_sales` tablosu (firm_nr='001', period_nr='01').
--   * Yalnızca `customer_name = 'Retail Customer'`.
--   * Yalnızca `DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE`
--     (bugün yapılmış).
--   * Yalnızca `is_cancelled = false` (iptal edilen satışlara dokunma).
--   * Yalnızca `payment_method = 'veresiye'` (zaten Nakit olanlara
--     dokunma, idempotent).
--
-- Tetikleyici etkisi (bilinçli):
--   * `payment_method` UPDATE'i `trg_auto_cash_line_sales` trigger'ını
--     tetikler → `fn_auto_cash_line_on_sale()` çalışır.
--   * 'Nakit' değeri kabul listesinde ('cash','nakit','kasa',...).
--   * Bu 37 satır için 37 yeni `rex_001_01_cash_lines` (KASA_GIRIS, sign=1)
--     INSERT'i + kasa register balance güncellemesi olur (yaklaşık
--     +1,152,661 IQD; net_amount toplamı). Bu beklenen davranış —
--     perakende nakit ödendiği için kasa'ya girmesi doğru.
--   * `customer_id` NULL olduğundan cash_lines.customer_id NULL kalır
--     (cari etkisi yok).
--   * party_ledger_movements'a dokunulmaz (cari hareketi yok).
--
-- Muhasebe denetimi:
--   * Cari: `rex_001_parties` tablosunda Retail Customer kartı YOK
--     (sorgu: 0 satır). Cari bakiye etkisi YOK.
--   * Mevcut cash_lines: Bu 37 satıra ait cash_lines YOK (veresiye
--     trigger erken çıkışı). UPDATE sonrası INSERT yeni satırlar
--     oluşturur.
--   * Dönem: Bugün aktif dönem (period 01) içinde; sorun yok.
--   * Kasa: yukarıdaki tetikleyici etkisi.
--
-- İdempotent:
--   * WHERE payment_method = 'veresiye' guard'ı.
--   * Tekrar çalıştırılırsa 0 satır günceller.
-- ============================================================================

BEGIN;

-- Önce/sonra sayaçları (debug + doğrulama)
CREATE TEMP TABLE _retail_198_log (
  step   text,
  cnt    bigint,
  amount numeric
) ON COMMIT DROP;

INSERT INTO _retail_198_log(step, cnt, amount)
SELECT 'before', COUNT(*), COALESCE(SUM(net_amount), 0)
  FROM rex_001_01_sales
 WHERE customer_name = 'Retail Customer'
   AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
   AND is_cancelled = false
   AND payment_method = 'veresiye';

UPDATE rex_001_01_sales
   SET payment_method = 'Nakit',
       updated_at = NOW()
 WHERE customer_name = 'Retail Customer'
   AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
   AND is_cancelled = false
   AND payment_method = 'veresiye';

INSERT INTO _retail_198_log(step, cnt, amount)
SELECT 'after_sales', COUNT(*), COALESCE(SUM(net_amount), 0)
  FROM rex_001_01_sales
 WHERE customer_name = 'Retail Customer'
   AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
   AND is_cancelled = false
   AND payment_method = 'Nakit';

-- Tetikleyici sonrası cash_lines: yeni eklenen KASA_GIRIS satırları
INSERT INTO _retail_198_log(step, cnt, amount)
SELECT 'cash_lines_new', COUNT(*), COALESCE(SUM(amount), 0)
  FROM rex_001_01_cash_lines
 WHERE transaction_type = 'KASA_GIRIS'
   AND definition LIKE 'Satış faturası — MRK-%'
   AND date::date = CURRENT_DATE
   AND register_id IN (
     SELECT id FROM rex_001_cash_registers WHERE is_active = true
   )
   AND created_at > NOW() - interval '5 minutes';

-- Log + commit
SELECT step, cnt, amount FROM _retail_198_log ORDER BY step;

COMMIT;
