-- Manuel SQL test: Cari Hesap Özeti — bekleyen rezervasyon avansı
-- Kullanıcı şikâyeti: "avanslar alınca carılerı alacaklı gösterıyor"
-- Bu test ile:
--   1) Mevcut cari bakiyeleri (avans dahil, ham `customers.balance`)
--   2) Bekleyen avans toplamı (cash_lines CH_TAHSILAT + REZERVASYON)
--   3) Avans hariç cari bakiye (ham bakiye + bekleyen avans)
-- doğrulanır.
--
-- Çalıştırma:
--   PGPASSWORD=... psql -h 127.0.0.1 -U postgres -d retailex_local \
--     -f database/migrations/manual_test_cari_avans.sql
--
-- firm_nr ve period_nr değişkenlerini kendi ortamınıza göre ayarlayın.
-- Varsayılan: firm 001, dönem 01 (standart RetailEX demo).

-- ═══════════════════════════════════════════════════════════════════
-- 1) Ham cari bakiyeleri (avans dahil, ledger'dan)
-- ═══════════════════════════════════════════════════════════════════
SELECT
  c.id,
  c.code,
  c.name,
  'customer'::text AS card_type,
  COALESCE(c.balance, 0)::numeric AS balance_raw
FROM rex_001_01_customers c
WHERE COALESCE(c.is_active, true) = true
ORDER BY c.name;

-- ═══════════════════════════════════════════════════════════════════
-- 2) Bekleyen avans toplamı (cash_lines REZERVASYON/AVANS satırları)
-- ═══════════════════════════════════════════════════════════════════
SELECT
  COALESCE(cl.customer_id::text, cl.party_id::text) AS cari_key,
  SUM(ABS(COALESCE(cl.amount, 0)))::numeric AS pending_deposit
FROM rex_001_01_cash_lines cl
WHERE cl.transaction_type = 'CH_TAHSILAT'
  AND UPPER(TRIM(COALESCE(cl.special_code, ''))) IN ('REZERVASYON', 'AVANS')
  AND (cl.customer_id IS NOT NULL OR cl.party_id IS NOT NULL)
GROUP BY COALESCE(cl.customer_id::text, cl.party_id::text);

-- ═══════════════════════════════════════════════════════════════════
-- 3) Birleşik — cari + avans + avans hariç bakiye
-- ═══════════════════════════════════════════════════════════════════
SELECT
  c.code,
  c.name,
  COALESCE(c.balance, 0)::numeric AS balance_raw,
  COALESCE(av.pending_deposit, 0)::numeric AS pending_deposit,
  -- Avans hariç bakiye: ham bakiye + bekleyen avans. Avans tahsilatı
  -- cari bakiyeyi azaltmış (CH_TAHSILAT → -amt); geri ekleyerek etkiyi
  -- geri alıyoruz. Kullanıcı beklentisi: avans bakiyeyi etkilemez.
  (COALESCE(c.balance, 0) + COALESCE(av.pending_deposit, 0))::numeric AS balance_avans_haric,
  CASE
    WHEN ABS(COALESCE(c.balance, 0)) > 0.01 THEN
      ROUND(100.0 * COALESCE(av.pending_deposit, 0) / ABS(COALESCE(c.balance, 0)), 1)
    ELSE 0
  END AS avans_orani_pct
FROM rex_001_01_customers c
LEFT JOIN (
  SELECT
    COALESCE(cl.customer_id::text, cl.party_id::text) AS cari_key,
    SUM(ABS(COALESCE(cl.amount, 0))) AS pending_deposit
  FROM rex_001_01_cash_lines cl
  WHERE cl.transaction_type = 'CH_TAHSILAT'
    AND UPPER(TRIM(COALESCE(cl.special_code, ''))) IN ('REZERVASYON', 'AVANS')
  GROUP BY COALESCE(cl.customer_id::text, cl.party_id::text)
) av ON av.cari_key = c.id::text
WHERE COALESCE(c.is_active, true) = true
  AND (ABS(COALESCE(c.balance, 0)) > 0.009 OR COALESCE(av.pending_deposit, 0) > 0.009)
ORDER BY c.name;

-- ═══════════════════════════════════════════════════════════════════
-- 4) KPI toplamları (rapor ekranındaki 1. ve 4. kart ile eşleşir)
-- ═══════════════════════════════════════════════════════════════════
SELECT
  kpi.kpi_label,
  kpi.total::numeric
FROM (
  SELECT
    'ALACAKLAR (avans hariç)' AS kpi_label,
    SUM(COALESCE(c.balance, 0) + COALESCE(av.pending_deposit, 0)) AS total
  FROM rex_001_01_customers c
  LEFT JOIN (
    SELECT
      COALESCE(cl.customer_id::text, cl.party_id::text) AS cari_key,
      SUM(ABS(COALESCE(cl.amount, 0))) AS pending_deposit
    FROM rex_001_01_cash_lines cl
    WHERE cl.transaction_type = 'CH_TAHSILAT'
      AND UPPER(TRIM(COALESCE(cl.special_code, ''))) IN ('REZERVASYON', 'AVANS')
    GROUP BY COALESCE(cl.customer_id::text, cl.party_id::text)
  ) av ON av.cari_key = c.id::text
  UNION ALL
  SELECT
    'BEKLEYEN AVANS',
    COALESCE(SUM(av.pending_deposit), 0)
  FROM rex_001_01_customers c
  LEFT JOIN (
    SELECT
      COALESCE(cl.customer_id::text, cl.party_id::text) AS cari_key,
      SUM(ABS(COALESCE(cl.amount, 0))) AS pending_deposit
    FROM rex_001_01_cash_lines cl
    WHERE cl.transaction_type = 'CH_TAHSILAT'
      AND UPPER(TRIM(COALESCE(cl.special_code, ''))) IN ('REZERVASYON', 'AVANS')
    GROUP BY COALESCE(cl.customer_id::text, cl.party_id::text)
  ) av ON av.cari_key = c.id::text
) kpi
ORDER BY kpi.kpi_label;
