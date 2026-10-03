-- ============================================================================
-- Migration 198: Retail Customer bugün satışlarında ödeme tipini Nakit'e çevir
-- ----------------------------------------------------------------------------
-- Plan referansı: Kullanıcı talebi 2026-10-03 23:29 (UTC+3) — kasap DB
-- (srv1253122.hstgr.cloud, DB: kasap, firm 001 / period 01).
--
-- Sorun:
--   * `customer_name = 'Retail Customer'` olan ve bugün yapılmış satışlar
--     farklı ödeme tipleriyle kaydedilmiş: 'veresiye' (37), 'cash' (30)
--     ve boş (24) — toplam 91 aktif satış.
--   * Perakende müşteri (Retail Customer) nakit ödemeli; cari hesap
--     açılmamış, customer_id NULL. 'veresiye' / 'cash' / boş işaretli
--     olması iş mantığına aykırı.
--   * Bu satışlar için kasa'ya yansıma eksik/yanlış (veresiye'de
--     cash_lines oluşmuyor; 'cash' lowercase trigger eşleşmesi
--     kaçırıyordu; boş olanlar NULL olarak kalıyordu).
--
-- Kapsam:
--   * Yalnızca `rex_001_01_sales` tablosu (firm_nr='001', period_nr='01').
--   * Yalnızca `customer_name = 'Retail Customer'`.
--   * Yalnızca `DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE`
--     (bugün yapılmış).
--   * Yalnızca `is_cancelled = false` (iptal edilen satışlara dokunma).
--   * Tüm 'veresiye', 'cash' (lowercase) ve boş (`''` / NULL) olan
--     satırları 'Nakit' yap. Zaten 'Nakit' olanlara dokunma
--     (idempotent).
--
-- Tetikleyici etkisi (bilinçli):
--   * `payment_method` UPDATE'i `trg_auto_cash_line_sales` trigger'ını
--     tetikler → `fn_auto_cash_line_on_sale()` çalışır.
--   * 'Nakit' değeri kabul listesinde (cash/nakit/kasa).
--   * 91 satır için 91 yeni `rex_001_01_cash_lines` (sign=+1) INSERT'i
--     olur; toplam +2,599,161 IQD MERKEZ KASA'ya yansır.
--   * `customer_id` NULL olduğundan cash_lines.customer_id NULL kalır
--     (cari etkisi yok).
--   * party_ledger_movements'a dokunulmaz (cari hareketi yok).
--
-- Muhasebe denetimi (2026-10-03 23:34):
--   * Cari: `rex_001_parties` tablosunda Retail Customer kartı YOK
--     (sorgu: 0 satır). Cari bakiye etkisi YOK.
--   * Dönem: Bugün aktif dönem (period 01) içinde; sorun yok.
--   * Sales ↔ Cash_lines mutabakatı: 91 = 91, 2,599,161 = 2,599,161 IQD.
--
-- İdempotent:
--   * WHERE COALESCE(NULLIF(TRIM(payment_method), ''), 'cash') <> 'Nakit'
--   * Tekrar çalıştırılırsa 0 satır günceller.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _retail_198_log (
  step   text,
  cnt    bigint,
  amount numeric
) ON COMMIT DROP;

INSERT INTO _retail_198_log(step, cnt, amount)
SELECT 'before_total', COUNT(*), COALESCE(SUM(net_amount), 0)
  FROM rex_001_01_sales
 WHERE customer_name = 'Retail Customer'
   AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
   AND is_cancelled = false;

INSERT INTO _retail_198_log(step, cnt, amount)
SELECT 'before_to_update', COUNT(*), COALESCE(SUM(net_amount), 0)
  FROM rex_001_01_sales
 WHERE customer_name = 'Retail Customer'
   AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
   AND is_cancelled = false
   AND COALESCE(NULLIF(TRIM(payment_method), ''), 'cash') <> 'Nakit';

UPDATE rex_001_01_sales
   SET payment_method = 'Nakit',
       updated_at = NOW()
 WHERE customer_name = 'Retail Customer'
   AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
   AND is_cancelled = false
   AND COALESCE(NULLIF(TRIM(payment_method), ''), 'cash') <> 'Nakit';

INSERT INTO _retail_198_log(step, cnt, amount)
SELECT 'after_sales_nakit', COUNT(*), COALESCE(SUM(net_amount), 0)
  FROM rex_001_01_sales
 WHERE customer_name = 'Retail Customer'
   AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
   AND is_cancelled = false
   AND payment_method = 'Nakit';

INSERT INTO _retail_198_log(step, cnt, amount)
SELECT 'cash_lines_today', COUNT(*), COALESCE(SUM(amount), 0)
  FROM rex_001_01_cash_lines
 WHERE DATE(date AT TIME ZONE 'UTC') = CURRENT_DATE
   AND sign = 1
   AND definition LIKE 'Satış faturası — MRK-%';

SELECT step, cnt, amount FROM _retail_198_log ORDER BY step;

COMMIT;
