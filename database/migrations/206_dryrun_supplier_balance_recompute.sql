-- ============================================================================
-- Migration 197: Tedarikçi balance recompute — DRY RUN (güvenli rapor)
-- ============================================================================
--
-- Amaç:
--   Migration 195'in UYGULANMADAN ÖNCE etkisini görmek için salt-okunur rapor.
--   Bu SQL hiçbir UPDATE / INSERT yapmaz, sadece CTE hesabı çalıştırır ve
--   farkları listeler.
--
--   Kullanım (güvenli, istediğiniz kadar çalıştırılabilir):
--     psql -d kasap -f database/migrations/206_dryrun_supplier_balance_recompute.sql
--
--   Çıktı:
--     1) Özet: kaç tedarikçi değişecek, toplam fark
--     2) Bireysel farklar (eski → yeni, fark, txn_count)
--     3) Kayıt yedek snapshot karşılaştırması (196 sonrası)
--
--   Kapsam: yalnız rex_001_suppliers (kasap firm 001 period 01).
--   Migration 196 snapshot'ına dokunmaz.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CTE hesabı — migration 195 ile birebir aynı
-- ----------------------------------------------------------------------------
WITH
sales_by_id AS (
  SELECT sl.customer_id AS id,
    SUM(CASE
          WHEN sl.fiche_type = 'purchase_invoice' THEN sl.net_amount
          WHEN sl.fiche_type = 'return_invoice'   THEN -sl.net_amount
          WHEN sl.fiche_type = 'opening_balance'  THEN sl.net_amount
          ELSE 0 END)::numeric AS line_contrib,
    COUNT(*)::int AS txn_count
  FROM rex_001_01_sales sl
  WHERE sl.customer_id IS NOT NULL
    AND COALESCE(sl.is_cancelled, false) = false
    AND sl.fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance')
    AND (
      sl.fiche_type IN ('return_invoice', 'opening_balance')
      OR COALESCE(sl.payment_method, '') NOT IN ('cash', 'nakit', 'peşin', 'peşin', 'pesin')
    )
  GROUP BY sl.customer_id
),
sales_by_name AS (
  SELECT s.id,
    SUM(CASE
          WHEN sl.fiche_type = 'purchase_invoice' THEN sl.net_amount
          WHEN sl.fiche_type = 'return_invoice'   THEN -sl.net_amount
          WHEN sl.fiche_type = 'opening_balance'  THEN sl.net_amount
          ELSE 0 END)::numeric AS line_contrib,
    COUNT(*)::int AS txn_count
  FROM rex_001_01_sales sl
  INNER JOIN rex_001_suppliers s
    ON TRIM(LOWER(COALESCE(sl.customer_name, ''))) = TRIM(LOWER(s.name))
  WHERE (sl.customer_id IS NULL OR sl.customer_id::text <> s.id::text)
    AND COALESCE(sl.is_cancelled, false) = false
    AND TRIM(COALESCE(sl.customer_name, '')) <> ''
    AND sl.fiche_type IN ('purchase_invoice', 'return_invoice', 'opening_balance')
    AND (
      sl.fiche_type IN ('return_invoice', 'opening_balance')
      OR COALESCE(sl.payment_method, '') NOT IN ('cash', 'nakit', 'peşin', 'peşin', 'pesin')
    )
  GROUP BY s.id
),
cash_by_customer_id AS (
  SELECT cl.customer_id AS id,
    SUM(CASE
          WHEN cl.customer_id IS NOT NULL AND UPPER(TRIM(cl.transaction_type)) = 'CH_ODEME'    THEN  ABS(cl.amount) * cl.sign * -1
          WHEN cl.customer_id IS NOT NULL AND UPPER(TRIM(cl.transaction_type)) = 'CH_TAHSILAT' THEN -ABS(cl.amount) * cl.sign
          ELSE 0 END)::numeric AS line_contrib,
    COUNT(*)::int AS txn_count
  FROM rex_001_01_cash_lines cl
  WHERE cl.customer_id IS NOT NULL
    AND UPPER(TRIM(cl.transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
  GROUP BY cl.customer_id
),
cash_by_party_id AS (
  SELECT cl.party_id AS id,
    SUM(CASE
          WHEN cl.customer_id IS NULL AND cl.party_id IS NOT NULL AND UPPER(TRIM(cl.transaction_type)) = 'CH_ODEME'    THEN -ABS(cl.amount) * cl.sign
          WHEN cl.customer_id IS NULL AND cl.party_id IS NOT NULL AND UPPER(TRIM(cl.transaction_type)) = 'CH_TAHSILAT' THEN  ABS(cl.amount) * cl.sign * -1
          ELSE 0 END)::numeric AS line_contrib,
    COUNT(*)::int AS txn_count
  FROM rex_001_01_cash_lines cl
  WHERE cl.party_id IS NOT NULL
    AND cl.customer_id IS NULL
    AND UPPER(TRIM(cl.transaction_type)) IN ('CH_ODEME', 'CH_TAHSILAT')
  GROUP BY cl.party_id
),
supplier_ledger AS (
  SELECT id,
    SUM(line_contrib)::numeric AS calculated_balance,
    SUM(txn_count)::int AS txn_count
  FROM (
    SELECT id, line_contrib, txn_count FROM sales_by_id
    UNION ALL
    SELECT id, line_contrib, txn_count FROM sales_by_name
    UNION ALL
    SELECT id, line_contrib, txn_count FROM cash_by_customer_id
    UNION ALL
    SELECT id, line_contrib, txn_count FROM cash_by_party_id
  ) u
  GROUP BY id
)

-- ----------------------------------------------------------------------------
-- RAPOR 1) Özet
-- ----------------------------------------------------------------------------
\echo ''
\echo '=== DRY RUN ÖZET ==='
\echo '(Hiçbir UPDATE/INSERT yapılmadı. Sadece hesap raporu.)'
\echo ''

SELECT
  COUNT(*) FILTER (WHERE s.balance != COALESCE(sl.calculated_balance, 0))
    AS degisecek_tedarikci,
  COUNT(*) FILTER (WHERE s.balance = COALESCE(sl.calculated_balance, 0) AND s.balance != 0)
    AS zaten_uyumlu_tedarikci,
  COUNT(*) FILTER (WHERE s.balance = 0 AND COALESCE(sl.calculated_balance, 0) = 0)
    AS sifir_bakiyeli_tedarikci,
  COALESCE(SUM(COALESCE(sl.calculated_balance, 0) - s.balance)
           FILTER (WHERE s.balance != COALESCE(sl.calculated_balance, 0)), 0)
    AS toplam_net_fark,
  ABS(COALESCE(SUM(ABS(COALESCE(sl.calculated_balance, 0) - s.balance))
           FILTER (WHERE s.balance != COALESCE(sl.calculated_balance, 0)), 0))
    AS toplam_mutlak_fark
FROM rex_001_suppliers s
LEFT JOIN supplier_ledger sl ON sl.id = s.id
WHERE s.is_active = true;

-- ----------------------------------------------------------------------------
-- RAPOR 2) Bireysel farklar — büyükten küçüğe (ilk 50)
-- ----------------------------------------------------------------------------
\echo ''
\echo '=== BİREYSEL FARKLAR (ilk 50, |diff| DESC) ==='
\echo ''

SELECT
  s.code                                              AS tedarikci_kodu,
  s.name                                              AS tedarikci_adi,
  s.balance                                           AS mevcut_balance,
  COALESCE(sl.calculated_balance, 0)                  AS yeni_balance,
  COALESCE(sl.calculated_balance, 0) - s.balance      AS fark,
  COALESCE(sl.txn_count, 0)                           AS txn_sayisi,
  CASE
    WHEN s.balance = 0 AND COALESCE(sl.calculated_balance, 0) = 0 THEN 'sıfır (etkisiz)'
    WHEN s.balance = 0 AND COALESCE(sl.calculated_balance, 0) != 0 THEN 'LEDGER VAR (DB boş!)'
    WHEN s.balance != 0 AND COALESCE(sl.calculated_balance, 0) = 0 THEN 'ORPHAN (defter boş!)'
    WHEN s.balance != COALESCE(sl.calculated_balance, 0) THEN 'UYUMSUZ'
    ELSE 'uyumlu'
  END AS durum
FROM rex_001_suppliers s
LEFT JOIN supplier_ledger sl ON sl.id = s.id
WHERE s.is_active = true
  AND s.balance != COALESCE(sl.calculated_balance, 0)
ORDER BY ABS(COALESCE(sl.calculated_balance, 0) - s.balance) DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- RAPOR 3) Snapshot karşılaştırması (196 sonrası yedek ile diff)
-- ----------------------------------------------------------------------------
\echo ''
\echo '=== SNAPSHOT 196 SONRASI: EN SON YEDEK ==='
\echo ''

SELECT
  s.code                                    AS tedarikci_kodu,
  s.balance                                 AS mevcut,
  snap.new_balance_snapshot                 AS yedek,
  s.balance - snap.new_balance_snapshot     AS yedek_farki
FROM rex_001_suppliers s
LEFT JOIN LATERAL (
  SELECT new_balance_snapshot
  FROM rex_001_supplier_balance_snapshot
  WHERE supplier_id = s.id
  ORDER BY run_at DESC
  LIMIT 1
) snap ON true
WHERE s.is_active = true
  AND s.balance != snap.new_balance_snapshot
ORDER BY ABS(s.balance - snap.new_balance_snapshot) DESC
LIMIT 20;

\echo ''
\echo '=== UYGULAMA İÇİN ==='
\echo '  Rapor uygunsa: npm run db:migrate   (195 otomatik çalışır)'
\echo '  Veya doğrudan: psql ... -f database/migrations/195_recompute_supplier_balances_kasap.sql'
\echo ''
\echo '  Geri alma (gerekirse, snapshot 196 sonrası):'
\echo '  UPDATE rex_001_suppliers s'
\echo '  SET balance = snap.new_balance_snapshot'
\echo '  FROM (SELECT DISTINCT ON (supplier_id) supplier_id, new_balance_snapshot'
\echo '        FROM rex_001_supplier_balance_snapshot ORDER BY supplier_id, run_at DESC) snap'
\echo '  WHERE s.id = snap.supplier_id AND s.balance != snap.new_balance_snapshot;'
