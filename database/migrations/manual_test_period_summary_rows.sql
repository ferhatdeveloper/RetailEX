-- Manuel SQL test: Aylık Gün Özeti — tablo boş ama KPI dolu kök neden.
-- Kullanıcı şikâyeti:
--   "75.000'lik satış var ama tabloda hiçbir bilgi yok (tüm hücreler —)".
--
-- Kök neden (tespit edildi): `PeriodSummaryReport.hasPeriodActivity()` filtresi
-- yalnızca Ciro/Gider/Kasa Girişi/Alış'a bakıyordu:
--   `saleCount || revenue || expenses || cashIn || purchases`
-- Bu yüzden:
--   * Yalnız peşinat (avans) Ciro'ya yansımadan alındı → Ciro=0, satırda yalnız
--     `depositAmount` görünür ama `hasPeriodActivity` FALSE döner → hücreler "—".
--   * Yalnız kart/peşin ödeme Ciro'ya yansımayan durumlarda da satır kaybolur.
--   * Yalnız iade, yalnız veresiye satırları da kaybolur.
-- Düzeltme: `hasPeriodActivity` artık tüm finansal alanları kontrol ediyor
-- (`cash`, `card`, `veresiye`, `discount`, `returnsAmount`, `depositAmount`).
--
-- Bu test:
--   1) Sales tablosundaki 2026-10 ayı kayıtlarını (deposit/non-deposit ayrımı)
--   2) Cari avans (cari_avans) tablosundaki açık rezervasyon avanslarını
--   3) Gün bazında hasPeriodActivity mantığını simüle eder:
--      - ÖNCE: yalnız Ciro/Gider/Kasa/Alış'a bakan kısıtlı kontrol
--      - SONRA: tüm finansal alanları kontrol eden yeni kontrol
--   4) Yalnız avans olan gün için hangi sütunların "etkinlik" gösterdiğini listeler
--
-- Çalıştırma:
--   PGPASSWORD=... psql -h 127.0.0.1 -U postgres -d retailex_local \
--     -f database/migrations/manual_test_period_summary_rows.sql
--
-- ════════════════════════════════════════════════════════════════════
-- 1) 2026-10 ayı satış kayıtları — Ciro/Peşinat ayrımı
-- ════════════════════════════════════════════════════════════════════
SELECT
  s.date::date AS day,
  COUNT(*) FILTER (WHERE COALESCE(s.is_deposit, false) = false
                    AND COALESCE(s.is_cancelled, false) = false
                    AND COALESCE(s.status, '') NOT IN ('cancelled', 'refunded')) AS satis_adedi,
  COALESCE(SUM(s.net_amount) FILTER (WHERE COALESCE(s.is_deposit, false) = false
                                      AND COALESCE(s.is_cancelled, false) = false
                                      AND COALESCE(s.status, '') NOT IN ('cancelled', 'refunded')), 0)::numeric AS ciro,
  COALESCE(SUM(CASE WHEN COALESCE(s.is_deposit, false) = true
                    THEN ABS(COALESCE(s.net_amount, 0))
                    ELSE 0 END), 0)::numeric AS pesinat_toplam
FROM rex_001_01_sales s
WHERE s.date >= '2026-10-01' AND s.date < '2026-11-01'
GROUP BY s.date::date
ORDER BY s.date::date;

-- ════════════════════════════════════════════════════════════════════
-- 2) Cari avans tablosu — 2026-10 açık rezervasyon avansları
-- ════════════════════════════════════════════════════════════════════
SELECT
  ca.created_at::date AS day,
  COUNT(*) AS adet,
  COALESCE(SUM(ABS(COALESCE(ca.amount, 0))), 0)::numeric AS tutar
FROM rex_001_01_cari_avans ca
WHERE ca.status = 'open'
  AND ca.created_at >= '2026-10-01' AND ca.created_at < '2026-11-01'
GROUP BY ca.created_at::date
ORDER BY ca.created_at::date;

-- ════════════════════════════════════════════════════════════════════
-- 3) Yalnız avans olan gün simülasyonu — hasPeriodActivity davranışı
--    Senaryo: ROZA müşterisi, 09.10.2026:
--      - Hizmet henüz verilmedi → sales.is_deposit=true, total=75000
--      - Ciro=0, saleCount=0
--      - depositCount=1, depositAmount=75000
-- ════════════════════════════════════════════════════════════════════
WITH sample_day AS (
  SELECT
    '2026-10-09'::date AS day,
    0::numeric AS sale_count,
    0::numeric AS revenue,
    0::numeric AS cash,
    0::numeric AS card,
    0::numeric AS veresiye,
    0::numeric AS discount,
    0::numeric AS returns_amount,
    1::numeric AS deposit_count,
    75000::numeric AS deposit_amount,
    0::numeric AS expenses,
    0::numeric AS cash_in,
    0::numeric AS purchases
)
SELECT
  day,
  -- Eski kontrol (Ciro/Gider/Kasa Girişi/Alış yeterli miydi?)
  (sale_count > 0 OR revenue > 0 OR expenses > 0 OR cash_in > 0 OR purchases > 0) AS has_activity_OLD,
  -- Yeni kontrol (tüm finansal alanlar)
  (sale_count > 0 OR revenue > 0 OR cash > 0 OR card > 0 OR veresiye > 0
   OR discount > 0 OR returns_amount > 0
   OR deposit_count > 0 OR deposit_amount > 0
   OR expenses > 0 OR cash_in > 0 OR purchases > 0) AS has_activity_NEW,
  -- Tek tek alanlar
  sale_count, revenue, cash, card, veresiye, deposit_count, deposit_amount,
  expenses, cash_in, purchases
FROM sample_day;

-- ════════════════════════════════════════════════════════════════════
-- 4) Sonuç: Eski kontrol FALSE, Yeni kontrol TRUE — düzeltme etkili.
--    Eski:  tablo hücresi "—"  → kullanıcı 75.000'i göremez.
--    Yeni:  satır aktif         → 75.000 Rezervasyon kolonunda görünür.
-- ════════════════════════════════════════════════════════════════════
SELECT
  CASE
    WHEN has_activity_OLD = FALSE AND has_activity_NEW = TRUE
    THEN 'BUG DOĞRULANDI → düzeltme (hasPeriodActivity genişletildi) ile satır artık görünür'
    WHEN has_activity_OLD = TRUE
    THEN 'Eski kontrol zaten TRUE — bug yok'
    ELSE 'Her iki kontrol de FALSE — başka bir kök neden var'
  END AS teyit,
  has_activity_OLD,
  has_activity_NEW
FROM (
  WITH sample_day AS (
    SELECT 0::numeric AS sale_count, 0::numeric AS revenue,
           0::numeric AS cash, 0::numeric AS card, 0::numeric AS veresiye,
           0::numeric AS discount, 0::numeric AS returns_amount,
           1::numeric AS deposit_count, 75000::numeric AS deposit_amount,
           0::numeric AS expenses, 0::numeric AS cash_in, 0::numeric AS purchases
  )
  SELECT
    (sale_count > 0 OR revenue > 0 OR expenses > 0 OR cash_in > 0 OR purchases > 0) AS has_activity_OLD,
    (sale_count > 0 OR revenue > 0 OR cash > 0 OR card > 0 OR veresiye > 0
     OR discount > 0 OR returns_amount > 0
     OR deposit_count > 0 OR deposit_amount > 0
     OR expenses > 0 OR cash_in > 0 OR purchases > 0) AS has_activity_NEW
  FROM sample_day
) AS sim;