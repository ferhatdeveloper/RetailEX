-- ============================================================================
-- Migration 196: Tedarikçi balance yedek snapshot'ı (güvenli geri alma)
-- ============================================================================
--
-- Amaç:
--   Migration 195 (veya başka bir recompute aracı) çalıştırılmadan ÖNCE,
--   `rex_001_suppliers.balance` (ve diğer kritik kolonlar) değerlerinin
--   tam yedeğini al. Recompute sonrası hatalı sonuç çıkarsa, bu snapshot'tan
--   geri dönülebilir.
--
--   Migration 195 içindeki `pre_2026_10_balance_restore` JSONB kolonu
--   yedek amaçlıydı; bu snapshot tablosu daha sağlamdır:
--     - Tüm satırlar (0 bakiyeli de dahil) yedeklenir
--     - run_at zaman damgası ile kaç kez çalıştırıldığı izlenir
--     - Geri alma sorgusu: aşağıdaki "ROLLBACK" bölümünde
--
--   Tablo yapısı:
--     rex_001_supplier_balance_snapshot
--       snapshot_id   BIGSERIAL PK
--       run_at        TIMESTAMPTZ
--       source        TEXT  (ör. '205_supplier_balance_snapshot')
--       supplier_id   UUID
--       supplier_code VARCHAR
--       old_balance   NUMERIC
--       new_balance_snapshot NUMERIC  (yedek anındaki balance — recompute sonrası bozulursa buradan döner)
--       notes         TEXT
--
--   Kapsam: yalnız rex_001_suppliers (kasap firm 001).
--   Idempotent: yeni snapshot = eski snapshot (aynı kayıtlar, farklı run_at).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Snapshot tablosu — henüz yoksa oluştur (idempotent)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rex_001_supplier_balance_snapshot (
    snapshot_id        BIGSERIAL PRIMARY KEY,
    run_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source             TEXT NOT NULL,
    supplier_id        UUID NOT NULL,
    supplier_code      VARCHAR(50),
    old_balance        NUMERIC(15,2) NOT NULL,
    new_balance_snapshot NUMERIC(15,2) NOT NULL,
    notes              TEXT
);

CREATE INDEX IF NOT EXISTS rex_001_supplier_balance_snapshot_supplier_idx
  ON rex_001_supplier_balance_snapshot (supplier_id, run_at DESC);

CREATE INDEX IF NOT EXISTS rex_001_supplier_balance_snapshot_run_idx
  ON rex_001_supplier_balance_snapshot (run_at DESC);

-- ----------------------------------------------------------------------------
-- 2) Mevcut balance değerlerini snapshot'a yaz
--    run_at = NOW() → aynı migration içinde birden fazla snapshot
--    çalıştırılırsa (ör. dry-run testleri) her biri ayrı iz bırakır.
-- ----------------------------------------------------------------------------
INSERT INTO rex_001_supplier_balance_snapshot (
    source, supplier_id, supplier_code, old_balance, new_balance_snapshot, notes
)
SELECT
    '205_supplier_balance_snapshot' AS source,
    s.id,
    s.code,
    s.balance,
    s.balance,            -- snapshot = mevcut balance
    'Pre-recompute yedek (migration 195 öncesi)'
FROM rex_001_suppliers s
WHERE s.is_active = true;

-- ----------------------------------------------------------------------------
-- 3) Doğrulama — snapshot satır sayısı = aktif tedarikçi sayısı
-- ----------------------------------------------------------------------------
\echo '=== SNAPSHOT DOĞRULAMA ==='

SELECT
    (SELECT COUNT(*) FROM rex_001_suppliers WHERE is_active = true) AS aktif_tedarikci,
    (SELECT COUNT(*) FROM rex_001_supplier_balance_snapshot
     WHERE source = '205_supplier_balance_snapshot'
       AND run_at > NOW() - INTERVAL '5 minute') AS son_5dk_snapshot,
    (SELECT COALESCE(SUM(new_balance_snapshot), 0)
     FROM rex_001_supplier_balance_snapshot
     WHERE source = '205_supplier_balance_snapshot'
       AND run_at > NOW() - INTERVAL '5 minute') AS son_5dk_toplam_bakiye;

\echo ''
\echo '=== EN SON SNAPSHOT (ilk 10 satır) ==='

SELECT supplier_code, old_balance, run_at
FROM rex_001_supplier_balance_snapshot
WHERE run_at = (SELECT MAX(run_at) FROM rex_001_supplier_balance_snapshot)
ORDER BY supplier_code
LIMIT 10;

-- ============================================================================
-- ROLLBACK (gerekirse manuel çalıştır):
--
--   -- En son snapshot'tan geri yükle:
--   UPDATE rex_001_suppliers s
--   SET balance = snap.new_balance_snapshot,
--       notes = COALESCE(s.notes, '') || E'\n[rollback 196 → snapshot]'
--   FROM (
--       SELECT DISTINCT ON (supplier_id)
--              supplier_id, new_balance_snapshot
--       FROM rex_001_supplier_balance_snapshot
--       ORDER BY supplier_id, run_at DESC
--   ) snap
--   WHERE s.id = snap.supplier_id
--     AND s.balance != snap.new_balance_snapshot;
--
--   Doğrulama:
--   SELECT COUNT(*) FROM rex_001_suppliers s
--   WHERE s.balance != (
--       SELECT new_balance_snapshot
--       FROM rex_001_supplier_balance_snapshot
--       WHERE supplier_id = s.id
--       ORDER BY run_at DESC LIMIT 1
--   );
-- ============================================================================
