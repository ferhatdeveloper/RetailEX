-- ============================================================================
-- Migration 190: CH_TAHSILAT/CH_ODEME ledger dual-write backfill
-- ============================================================================
--
-- Amaç:
--   `createKasaIslemi` akışı müşteri/tedarikçi CH_TAHSILAT/CH_ODEME satırlarını
--   yalnızca `cash_lines` tablosuna yazıyordu. Yeni kod (kasa.ts PostgREST +
--   direct path) aynı transaction içinde:
--     1) party_ledger_movements   → cari tarafı (customer/supplier)
--     2) account_movements        → kasa tarafı (genel muhasebe)
--   tablolarına da yazıyor. Bu migration mevcut cash_lines verisinden eksik
--   ledger satırlarını geriye dönük oluşturur (idempotent — NOT EXISTS guard).
--
-- Kapsam:
--   - Tüm `rex_<firm>_<period>_cash_lines` tabloları (firm_nr/period_nr prefix
--     discovery: information_schema).
--   - Yalnızca CH_TAHSILAT + CH_ODEME transaction_type'ları (personel/ortak
--     CH_ODEME_PARTNER zaten doğru yazılıyordu; cash_lines customer_id ya da
--     party_id dolu olan customer/supplier satırları).
--   - person_id/party_id (employee/partner) hariç tutulur (zaten partner/employee
--     ledger kayıtları ayrı kanaldan yazılıyor).
--
-- İşaret yönü (90 yıllık muhasebeci):
--   customer CH_TAHSILAT (tahsilat, bizim alacağımız azalır) → party_ledger sign: -1
--   customer CH_ODEME    (müşteriye iade/avans, bizim alacağımız artar)   → party_ledger sign: +1
--   supplier CH_ODEME    (tedarikçiye ödeme, bizim borcumuz azalır)        → party_ledger sign: +1
--   supplier CH_TAHSILAT (tedarikçiden iade, bizim borcumuz artar)         → party_ledger sign: -1
--   account_movements (kasa tarafı) → CH_TAHSILAT +1, CH_ODEME -1.
--
-- Tauri uyumu: DO $$ BLOKLARI YOK. Tüm statement'lar tek tek.
-- Idempotent: zaten yazılmış ledger kayıtları cash_line_id üzerinden atlanır.
--
-- Çalıştırma:
--   - Tek firma için (örn. kasap firm 001 period 01): mevcut psql ile
--     PGPASSWORD=Yq7xwQpt6c psql -h 72.60.182.107 -U postgres -d kasap -f
--     database/migrations/190_cash_ledger_dual_write_backfill.sql
--   - Tüm RetailEX kiracı DB'leri için: `npm run db:migrate:tenants`.
-- ============================================================================

-- 1) Yardımcı: ledger yazımı için firm-period başına çalışacak prosedür.
--    DO $$ yok → ayrı CREATE FUNCTION + RETURN ile çalıştırılır.
CREATE OR REPLACE FUNCTION rex_backfill_cash_dual_ledger(
  p_firm_nr text,
  p_period_nr text
) RETURNS TABLE(
  ledger_inserted int,
  account_inserted int
) AS $$
DECLARE
  v_prefix text := 'rex_' || p_firm_nr || '_' || p_period_nr;
  v_cash text := v_prefix || '_cash_lines';
  v_ledger text := v_prefix || '_party_ledger_movements';
  v_account text := v_prefix || '_account_movements';
  v_customers text := 'rex_' || p_firm_nr || '_customers';
  v_suppliers text := 'rex_' || p_firm_nr || '_suppliers';
  v_ledger_n int := 0;
  v_account_n int := 0;
BEGIN
  -- Tablo var mı kontrol (eski dönem/eksik kurulum için skip).
  IF to_regclass(v_cash) IS NULL THEN
    RETURN QUERY SELECT 0::int, 0::int;
    RETURN;
  END IF;
  IF to_regclass(v_ledger) IS NULL THEN
    -- party_ledger_movements tablosu yoksa oluştur (Tauri uyumlu CREATE TABLE).
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr         VARCHAR(10) NOT NULL,
        period_nr       VARCHAR(10) NOT NULL,
        party_id        UUID NOT NULL,
        card_type       VARCHAR(20) NOT NULL,
        trcode          INTEGER,
        transaction_type VARCHAR(50) NOT NULL,
        date            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        amount          DECIMAL(15,2) DEFAULT 0,
        sign            INTEGER DEFAULT 0,
        definition      TEXT,
        source_module   VARCHAR(50),
        source_id       UUID,
        cash_line_id    UUID,
        created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )', v_ledger);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (firm_nr, period_nr, party_id, date)',
      v_prefix || '_party_ledger_firm_period_party_date_idx', v_ledger);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (transaction_type)',
      v_prefix || '_party_ledger_trtype_idx', v_ledger);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (cash_line_id)',
      v_prefix || '_party_ledger_cash_line_id_idx', v_ledger);
  END IF;
  IF to_regclass(v_account) IS NULL THEN
    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firm_nr      VARCHAR(10) NOT NULL,
        period_nr    VARCHAR(10) NOT NULL,
        ref_id       INTEGER,
        client_ref   INTEGER,
        customer_id  UUID,
        supplier_id  UUID,
        fiche_no     VARCHAR(100),
        date         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        amount       DECIMAL(15,2) DEFAULT 0,
        sign         INTEGER DEFAULT 0,
        trcode       INTEGER,
        module_nr    INTEGER,
        definition   TEXT,
        created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )', v_account);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (customer_id, date)',
      v_prefix || '_account_movements_cust_date_idx', v_account);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (supplier_id, date)',
      v_prefix || '_account_movements_supp_date_idx', v_account);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (fiche_no)',
      v_prefix || '_account_movements_fiche_no_idx', v_account);
  END IF;

  -- party_ledger idempotent guard: aynı cash_line_id + transaction_type ile
  -- kayıt zaten varsa INSERT'i atla. Mevcut CH_ODEME_PARTNER'lar korunur.
  EXECUTE format('
    INSERT INTO %I (
      firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
      date, amount, sign, definition, source_module, source_id, cash_line_id
    )
    SELECT
      cl.firm_nr,
      cl.period_nr,
      COALESCE(cl.customer_id, cl.party_id) AS party_id,
      CASE WHEN cl.customer_id IS NOT NULL THEN ''customer'' ELSE ''supplier'' END AS card_type,
      0 AS trcode,
      cl.transaction_type,
      cl.date,
      cl.amount AS amount,
      CASE
        WHEN cl.customer_id IS NOT NULL AND cl.transaction_type = ''CH_TAHSILAT'' THEN -1
        WHEN cl.customer_id IS NOT NULL AND cl.transaction_type = ''CH_ODEME'' THEN 1
        WHEN cl.customer_id IS NULL AND cl.party_id IS NOT NULL
             AND cl.transaction_type = ''CH_ODEME'' THEN 1
        WHEN cl.customer_id IS NULL AND cl.party_id IS NOT NULL
             AND cl.transaction_type = ''CH_TAHSILAT'' THEN -1
        ELSE 0
      END AS sign,
      COALESCE(cl.definition, '''') AS definition,
      ''cash_backfill_190'' AS source_module,
      cl.id AS source_id,
      cl.id AS cash_line_id
    FROM %I cl
    WHERE cl.transaction_type IN (''CH_TAHSILAT'', ''CH_ODEME'')
      AND (cl.customer_id IS NOT NULL OR cl.party_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM %I pl
        WHERE pl.cash_line_id = cl.id
          AND pl.transaction_type = cl.transaction_type
      )
  ', v_ledger, v_cash, v_ledger);

  GET DIAGNOSTICS v_ledger_n = ROW_COUNT;

  -- account_movements idempotent guard: aynı fiche_no + customer_id/supplier_id
  -- ile kayıt zaten varsa INSERT'i atla.
  EXECUTE format('
    INSERT INTO %I (
      firm_nr, period_nr, ref_id, client_ref, customer_id, supplier_id,
      fiche_no, date, amount, sign, trcode, module_nr, definition
    )
    SELECT
      cl.firm_nr,
      cl.period_nr,
      NULL AS ref_id,
      NULL AS client_ref,
      CASE WHEN cl.customer_id IS NOT NULL THEN cl.customer_id ELSE NULL END,
      CASE WHEN cl.customer_id IS NULL AND cl.party_id IS NOT NULL THEN cl.party_id ELSE NULL END,
      cl.fiche_no,
      cl.date,
      cl.amount AS amount,
      CASE WHEN cl.transaction_type = ''CH_TAHSILAT'' THEN 1 ELSE -1 END AS sign,
      0 AS trcode,
      0 AS module_nr,
      COALESCE(cl.definition, '''') AS definition
    FROM %I cl
    WHERE cl.transaction_type IN (''CH_TAHSILAT'', ''CH_ODEME'')
      AND (cl.customer_id IS NOT NULL OR cl.party_id IS NOT NULL)
      AND cl.fiche_no IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM %I am
        WHERE am.fiche_no = cl.fiche_no
          AND (
            (cl.customer_id IS NOT NULL AND am.customer_id = cl.customer_id)
            OR (cl.party_id IS NOT NULL AND cl.customer_id IS NULL AND am.supplier_id = cl.party_id)
          )
      )
  ', v_account, v_cash, v_account);

  GET DIAGNOSTICS v_account_n = ROW_COUNT;

  RETURN QUERY SELECT v_ledger_n, v_account_n;
END;
$$ LANGUAGE plpgsql;

-- 2) public içindeki tüm `rex_<firm>_<period>_cash_lines` tablolarını bul ve
--    her biri için backfill fonksiyonunu çalıştır. firm_nr/period_nr, tablo
--    adından regex yerine string slicing ile parse edilir.
DO $$
DECLARE
  r record;
  v_total_ledger int := 0;
  v_total_account int := 0;
  v_n_ledger int;
  v_n_account int;
  v_firm text;
  v_period text;
  v_tablename text;
BEGIN
  FOR r IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
    ORDER BY t.table_name
  LOOP
    v_tablename := r.table_name;
    -- "rex_001_01_cash_lines" → firm="001", period="01"
    v_firm := split_part(v_tablename, '_', 2);
    v_period := split_part(v_tablename, '_', 3);
    SELECT ledger_inserted, account_inserted INTO v_n_ledger, v_n_account
    FROM rex_backfill_cash_dual_ledger(v_firm, v_period);
    v_total_ledger := v_total_ledger + COALESCE(v_n_ledger, 0);
    v_total_account := v_total_account + COALESCE(v_n_account, 0);
    RAISE NOTICE '[190] rex_%_% cash_ledger backfill: ledger=%, account=%',
      v_firm, v_period, COALESCE(v_n_ledger, 0), COALESCE(v_n_account, 0);
  END LOOP;
  RAISE NOTICE '[190] TOTAL backfill rows: party_ledger=%, account_movements=%',
    v_total_ledger, v_total_account;
END $$;

-- 3) Yardımcı fonksiyon migration sonunda drop et (bir kez çalıştır, temizle).
DROP FUNCTION IF EXISTS rex_backfill_cash_dual_ledger(text, text);

-- 4) Hesap/ledger tablosu indeks güvencesi (CREATE INDEX IF NOT EXISTS → idempotent).
--    public üzerinden tüm `rex_<firm>_<period>_party_ledger_movements` /
--    `rex_<firm>_<period>_account_movements` tabloları için cash_line_id + fiche_no
--    indeksleri.
DO $$
DECLARE
  r record;
  v_tn text;
  v_idx_name text;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ~ '^rex_[0-9]+_[0-9]+_party_ledger_movements$'
  LOOP
    v_tn := r.table_name;
    -- v_tn: "rex_001_01_party_ledger_movements" → idx name = "rex_001_01_party_ledger_clid_idx"
    v_idx_name := replace(v_tn, '_party_ledger_movements', '_party_ledger_clid_idx');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (cash_line_id)',
      v_idx_name, v_tn);
  END LOOP;
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ~ '^rex_[0-9]+_[0-9]+_account_movements$'
  LOOP
    v_tn := r.table_name;
    v_idx_name := replace(v_tn, '_account_movements', '_account_movements_fiche_no_idx');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (fiche_no)',
      v_idx_name, v_tn);
    v_idx_name := replace(v_tn, '_account_movements', '_account_movements_supp_date_idx');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (supplier_id, date)',
      v_idx_name, v_tn);
  END LOOP;
END $$;