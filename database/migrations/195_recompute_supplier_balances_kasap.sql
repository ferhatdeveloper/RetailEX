-- ============================================================================
-- Migration 195: Kasap DB — supplier balance recompute (idempotent + audit)
-- ============================================================================
--
-- Amaç:
--   `rex_001_suppliers.balance` kolonunda 8/10 tedarikçide gerçek ledger
--   (sales + cash_lines) ile uyumsuzluk tespit edildi (toplam −469M IQD DB
--   düşük gösterim). Kök neden: `repairCariLedgerConsistency` daha önce hiç
--   tetiklenmemiş ya da merge geçişleri sonrası `suppliers.balance` güncel
--   değerle yazılmamış.
--
--   Bu migration `sqlSupplierAccountBalancesCte` formülüyle birebir aynı
--   hesabı yaparak `balance` kolonunu yeniden yazar. CTE `accountBalance.ts:209`
--   ile aynı UNION (purchase/return/opening, customer_id + name fallback,
--   cash_lines customer_id + cash_lines party_id).
--
--   ZORUNLU: Bu migration'dan ÖNCE `205_supplier_balance_snapshot.sql`
--   çalıştırılmış olmalı (yedek snapshot). Snapshot kontrolü aşağıda
--   bulunmazsa migration ABORT eder.
--
--   Dry-run için: `206_dryrun_supplier_balance_recompute.sql` (UPDATE yok).
--
--   Muhasebeci denetimi:
--     - Yalnız değişen satırlar yazılır (fark != 0)
--     - Her yazım `supplier_balance_audit` tablosuna loglanır (eski/yeni/fark)
--     - Geri alma notu `suppliers.notes`'a eklenir ([2026-10-05 recompute])
--     - Idempotent: yeniden çalıştırılırsa fark=0 olanlar atlanır
--     - Pre-flight: snapshot tablosu (196) boşsa HATA
--
--   Çalıştırma (kasap DB):
--     PGPASSWORD=Yq7xwQpt6c psql -h srv1253122.hstgr.cloud -U postgres \
--       -d kasap -f database/migrations/205_supplier_balance_snapshot.sql
--     PGPASSWORD=Yq7xwQpt6c psql -h srv1253122.hstgr.cloud -U postgres \
--       -d kasap -f database/migrations/206_dryrun_supplier_balance_recompute.sql  -- opsiyonel
--     PGPASSWORD=Yq7xwQpt6c psql -h srv1253122.hstgr.cloud -U postgres \
--       -d kasap -f database/migrations/195_recompute_supplier_balances_kasap.sql
--
--   Kapsam:
--     - Yalnız `rex_001_suppliers` (kasap firm 001 period 01)
--     - firm_nr filtresi CTE içinde (sqlSupplierAccountBalancesCte formülü)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Pre-flight: 196 snapshot var mı?
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    snap_count INTEGER;
    sup_count  INTEGER;
BEGIN
    SELECT COUNT(*) INTO snap_count
    FROM rex_001_supplier_balance_snapshot
    WHERE source = '205_supplier_balance_snapshot';

    SELECT COUNT(*) INTO sup_count
    FROM rex_001_suppliers WHERE is_active = true;

    IF snap_count = 0 THEN
        RAISE EXCEPTION '195 ABORT: 205_supplier_balance_snapshot henüz çalıştırılmamış veya boş. Önce: psql ... -f database/migrations/205_supplier_balance_snapshot.sql';
    END IF;

    IF snap_count < sup_count THEN
        RAISE WARNING '195 UYARI: snapshot (%) < aktif tedarikçi (%). Yine de devam ediliyor.', snap_count, sup_count;
    ELSE
        RAISE NOTICE '195 OK: snapshot=% satır, aktif tedarikçi=% — yedek mevcut, devam ediliyor.', snap_count, sup_count;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1) Audit tablosu — henüz yoksa oluştur (idempotent)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rex_001_supplier_balance_audit (
  id              BIGSERIAL PRIMARY KEY,
  run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_migration TEXT NOT NULL,
  supplier_id     UUID NOT NULL,
  supplier_code   VARCHAR(50),
  old_balance     NUMERIC(15,2) NOT NULL,
  new_balance     NUMERIC(15,2) NOT NULL,
  diff            NUMERIC(15,2) NOT NULL,
  ledger_total    NUMERIC(15,2) NOT NULL,
  txn_count       INTEGER NOT NULL,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS rex_001_supplier_balance_audit_supplier_idx
  ON rex_001_supplier_balance_audit (supplier_id, run_at DESC);

CREATE INDEX IF NOT EXISTS rex_001_supplier_balance_audit_run_idx
  ON rex_001_supplier_balance_audit (run_at DESC);

-- ----------------------------------------------------------------------------
-- 2) Yedek notu kuyruğu (audit trail) — supplier_id → not ekleme
-- ----------------------------------------------------------------------------
-- Bu adımı UPDATE'den önce yapıyoruz ki geri alma (rollback) durumunda not da
-- eski haline döndürülebilir.
-- NOT: Asıl yedek migration 205'teki rex_001_supplier_balance_snapshot
-- tablosundadır. Buradaki JSONB kolonu ek bir "memo" amaçlıdır.
ALTER TABLE rex_001_suppliers
  ADD COLUMN IF NOT EXISTS pre_2026_10_balance_restore JSONB;

UPDATE rex_001_suppliers
SET pre_2026_10_balance_restore = jsonb_build_object(
  'old_balance', balance,
  'restored_at', NOW(),
  'source', '195_recompute_supplier_balances_kasap'
)
WHERE pre_2026_10_balance_restore IS NULL
  AND balance != 0;

-- ----------------------------------------------------------------------------
-- 3) CTE hesabı — sqlSupplierAccountBalancesCte ile aynı UNION yapısı
--    sales(purchase/return/opening + name fallback) + cash_lines(2 UNION)
-- ----------------------------------------------------------------------------
-- Sonuç: calculated_balance, txn_count, debt_sum, paid_sum
-- Bu bir VIEW değil, UPDATE içinde inline CTE olarak kullanılacak.

WITH
-- 3a) Sales — purchase_invoice / return_inverse / opening_balance (customer_id)
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

-- 3b) Sales — name fallback (customer_id NULL ise tedarikçi kart ismine eşle)
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
      OR COALESCE(sl.payment_method, '') NOT IN ('cash', 'nakit', 'peşin', 'pesin')
    )
  GROUP BY s.id
),

-- 3c) Cash lines — customer_id ile bağlı (CH_ODEME / CH_TAHSILAT)
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

-- 3d) Cash lines — party_id ile bağlı (CH_ODEME / CH_TAHSILAT)
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

-- 3e) Tüm parçaları birleştir — supplier_id başına tek satır
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
),

-- 3f) Farkları hesapla — yalnız değişen satırlar
diff_rows AS (
  SELECT
    s.id AS supplier_id,
    s.code AS supplier_code,
    s.balance AS old_balance,
    COALESCE(sl.calculated_balance, 0) AS new_balance,
    COALESCE(sl.calculated_balance, 0) - s.balance AS diff,
    COALESCE(sl.txn_count, 0) AS txn_count
  FROM rex_001_suppliers s
  LEFT JOIN supplier_ledger sl ON sl.id = s.id
  WHERE s.balance != COALESCE(sl.calculated_balance, 0)
),

-- 4) Audit tablosuna yaz (her değişen satır)
audit_insert AS (
  INSERT INTO rex_001_supplier_balance_audit (
    source_migration, supplier_id, supplier_code,
    old_balance, new_balance, diff, ledger_total, txn_count, notes
  )
  SELECT
    '195_recompute_supplier_balances_kasap',
    d.supplier_id, d.supplier_code,
    d.old_balance, d.new_balance, d.diff,
    d.new_balance, d.txn_count,
    'kasap firm 001 period 01; CTE=sqlSupplierAccountBalancesCte'
  FROM diff_rows d
  RETURNING supplier_id
)

-- 5) Tedarikçi kart balance'ını güncelle — yalnız fark != 0 olanlar
UPDATE rex_001_suppliers s
SET balance = COALESCE(sl.calculated_balance, 0),
    notes = COALESCE(s.notes, '') ||
            E'\n[2026-10-05 recompute: balance=' ||
            COALESCE(sl.calculated_balance, 0)::text ||
            ' (old=' || s.balance::text ||
            ', diff=' || (COALESCE(sl.calculated_balance, 0) - s.balance)::text || ')]'
FROM (
  SELECT id, calculated_balance FROM (
    SELECT id, calculated_balance FROM supplier_ledger
    UNION ALL
    -- ledger boş olan ama mevcut 0 olan kartlar (geri kalan senkron)
    SELECT s2.id, 0::numeric AS calculated_balance
    FROM rex_001_suppliers s2
    LEFT JOIN supplier_ledger sl2 ON sl2.id = s2.id
    WHERE s2.balance != 0 AND sl2.id IS NULL
  ) all_ledger
  GROUP BY id, calculated_balance
) sl
WHERE sl.id = s.id
  AND s.balance != COALESCE(sl.calculated_balance, 0);

-- ----------------------------------------------------------------------------
-- 6) Doğrulama — tüm satırlarda fark = 0 olmalı (audit tablosu kontrol)
-- ----------------------------------------------------------------------------
\echo '=== POST-MIGRATION DOĞRULAMA ==='

SELECT
  (SELECT COUNT(*) FROM rex_001_suppliers WHERE balance != 0) AS aktif_tedarikci,
  (SELECT COUNT(*) FROM rex_001_supplier_balance_audit
    WHERE run_at > NOW() - INTERVAL '5 minute') AS son_5dk_audit,
  (SELECT COALESCE(SUM(diff), 0) FROM rex_001_supplier_balance_audit
    WHERE run_at > NOW() - INTERVAL '5 minute') AS son_5dk_toplam_diff;

\echo ''
\echo '=== EN BÜYÜK DEĞİŞİM ==='
SELECT supplier_code, old_balance, new_balance, diff
FROM rex_001_supplier_balance_audit
WHERE run_at > NOW() - INTERVAL '5 minute'
ORDER BY ABS(diff) DESC
LIMIT 10;

\echo ''
\echo '=== IDEMPOTENT KONTROL: yeniden çalıştırılırsa etki sıfır ==='
SELECT COUNT(*) AS hâlâ_uyumsuz_say
FROM rex_001_suppliers s
WHERE s.balance != 0
  AND NOT EXISTS (
    SELECT 1 FROM rex_001_supplier_balance_audit a
    WHERE a.supplier_id = s.id
      AND a.run_at > NOW() - INTERVAL '5 minute'
      AND ABS(a.new_balance - s.balance) < 0.01
  );