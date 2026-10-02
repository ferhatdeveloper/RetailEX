-- ============================================================================
-- Migration 191: account_movements transaction_type backfill + cash_lines dual-write guard
-- ============================================================================
--
-- Amaç:
--   Migration 190 (cash_lines dual ledger backfill) `account_movements.transaction_type`
--   kolonunu yok sayarak CH_TAHSILAT / CH_ODEME INSERT'ini atlamıştı. Bu migration:
--     1) `account_movements.transaction_type` kolonunu idempotent ekler (yoksa).
--     2) Eksik CH_TAHSILAT / CH_ODEME satırlarını cash_lines'tan geriye dönük yazar.
--     3) party_ledger_movements sign simetrisini yeniden doğrular (CH_ODEME supplier
--        sign=+1, CH_TAHSILAT supplier sign=-1, customer tarafı tersi).
--
-- Kök neden:
--   - Önceki ajan tenant DB'sini "OK" rapor etmişti ama migration 190 bu DB'de:
--       * `account_movements.transaction_type` kolonu şemada yoktu → 0 satır INSERT
--       * `party_ledger_movements` mevcuttu (eski şemadan), 22 CH_ODEME satırı
--         supplier card_type ile sign=-1 olarak yazılmıştı (yanlış işaret).
--   - 190 v2 yalnızca `NOT EXISTS (cash_line_id eşleşmesi)` guard'ı kullanır.
--     Eğer eski kod ledger satırını cash_line_id olmadan yazdıysa 190 bunları
--     görmez; UPDATE ile düzeltilmesi gerekir.
--
-- İşaret yönü (90 yıllık muhasebeci):
--   customer CH_TAHSILAT (tahsilat, bizim alacağımız azalır) → party_ledger sign: -1
--   customer CH_ODEME    (müşteriye iade/avans, alacak artar)   → party_ledger sign: +1
--   supplier CH_ODEME    (tedarikçiye ödeme, borç azalır)       → party_ledger sign: +1
--   supplier CH_TAHSILAT (tedarikçiden iade, borç artar)        → party_ledger sign: -1
--   account_movements (kasa tarafı) → CH_TAHSILAT +1, CH_ODEME -1.
--
-- Tauri uyumu: DOSYA DÜZEYİNDE DO $$ BLOKLARI YOK. Tüm mantık PL/pgSQL
-- fonksiyonları içinde (CREATE FUNCTION + RETURN + SELECT çağrısı).
-- Idempotent: tüm UPDATE / INSERT guard'lı, tekrar tekrar çalıştırılabilir.
--
-- Çalıştırma:
--   - Tek firma için (örn. aqua_beauty firm 001 period 01):
--       PGPASSWORD=... psql -h 72.60.182.107 -U postgres -d aqua_beauty \
--         -f database/migrations/191_account_movements_transaction_type_backfill.sql
--   - Tüm RetailEX kiracı DB'leri için: `npm run db:migrate:tenants`.
-- ============================================================================

-- 1) Yardımcı: account_movements transaction_type backfill prosedürü.
CREATE OR REPLACE FUNCTION rex_backfill_account_movements_191(
  p_firm_nr text,
  p_period_nr text
) RETURNS TABLE(
  account_inserted int
) AS $$
DECLARE
  v_prefix text := 'rex_' || p_firm_nr || '_' || p_period_nr;
  v_cash text := v_prefix || '_cash_lines';
  v_account text := v_prefix || '_account_movements';
  v_has_party_id boolean := false;
  v_has_customer_id boolean := false;
  v_has_transaction_type boolean := false;
  v_account_n int := 0;
BEGIN
  -- Tablo var mı kontrol (eski dönem/eksik kurulum için skip).
  IF to_regclass(v_account) IS NULL OR to_regclass(v_cash) IS NULL THEN
    RETURN QUERY SELECT 0::int;
    RETURN;
  END IF;

  -- account_movements.transaction_type kolonu idempotent ekle.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = v_account
      AND column_name = 'transaction_type'
  ) INTO v_has_transaction_type;

  IF NOT v_has_transaction_type THEN
    EXECUTE format('ALTER TABLE %I ADD COLUMN transaction_type VARCHAR(50)', v_account);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (transaction_type)',
      v_prefix || '_account_movements_trtype_idx', v_account);
  END IF;

  -- cash_lines kolon varlık testi.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = v_cash
      AND column_name = 'party_id'
  ) INTO v_has_party_id;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = v_cash
      AND column_name = 'customer_id'
  ) INTO v_has_customer_id;

  -- Eksik CH_TAHSILAT / CH_ODEME account_movements satırları INSERT.
  IF v_has_party_id THEN
    EXECUTE format('
      INSERT INTO %I (
        firm_nr, period_nr, ref_id, client_ref, customer_id, supplier_id,
        fiche_no, date, amount, sign, trcode, module_nr, definition, transaction_type
      )
      SELECT
        cl.firm_nr,
        cl.period_nr,
        NULL::int, NULL::int,
        CASE WHEN cl.customer_id IS NOT NULL THEN cl.customer_id ELSE NULL END,
        CASE WHEN cl.customer_id IS NULL AND cl.party_id IS NOT NULL THEN cl.party_id ELSE NULL END,
        cl.fiche_no,
        cl.date,
        cl.amount,
        CASE WHEN cl.transaction_type = ''CH_TAHSILAT'' THEN 1 ELSE -1 END,
        0, 0,
        COALESCE(cl.definition, ''''),
        cl.transaction_type
      FROM %I cl
      WHERE cl.transaction_type IN (''CH_TAHSILAT'', ''CH_ODEME'')
        AND (cl.customer_id IS NOT NULL OR cl.party_id IS NOT NULL)
        AND cl.fiche_no IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM %I am
          WHERE am.fiche_no = cl.fiche_no
            AND am.transaction_type = cl.transaction_type
            AND (
              (cl.customer_id IS NOT NULL AND am.customer_id = cl.customer_id)
              OR (cl.party_id IS NOT NULL AND cl.customer_id IS NULL AND am.supplier_id = cl.party_id)
            )
        )
    ', v_account, v_cash, v_account);
  ELSIF v_has_customer_id THEN
    EXECUTE format('
      INSERT INTO %I (
        firm_nr, period_nr, ref_id, client_ref, customer_id, supplier_id,
        fiche_no, date, amount, sign, trcode, module_nr, definition, transaction_type
      )
      SELECT
        cl.firm_nr,
        cl.period_nr,
        NULL::int, NULL::int,
        cl.customer_id, NULL,
        cl.fiche_no,
        cl.date,
        cl.amount,
        CASE WHEN cl.transaction_type = ''CH_TAHSILAT'' THEN 1 ELSE -1 END,
        0, 0,
        COALESCE(cl.definition, ''''),
        cl.transaction_type
      FROM %I cl
      WHERE cl.transaction_type IN (''CH_TAHSILAT'', ''CH_ODEME'')
        AND cl.customer_id IS NOT NULL
        AND cl.fiche_no IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM %I am
          WHERE am.fiche_no = cl.fiche_no
            AND am.transaction_type = cl.transaction_type
            AND am.customer_id = cl.customer_id
        )
    ', v_account, v_cash, v_account);
  END IF;

  GET DIAGNOSTICS v_account_n = ROW_COUNT;
  RETURN QUERY SELECT v_account_n;
END;
$$ LANGUAGE plpgsql;

-- 2) party_ledger_movements sign simetrisi düzeltmesi — supplier CH_ODEME sign=-1 → +1.
--    Idempotent: yalnızca yanlış işaretli satırları günceller.
CREATE OR REPLACE FUNCTION rex_fix_party_ledger_signs_191(
  p_firm_nr text,
  p_period_nr text
) RETURNS TABLE(
  signs_fixed int
) AS $$
DECLARE
  v_prefix text := 'rex_' || p_firm_nr || '_' || p_period_nr;
  v_cash text := v_prefix || '_cash_lines';
  v_ledger text := v_prefix || '_party_ledger_movements';
  v_n int := 0;
BEGIN
  IF to_regclass(v_cash) IS NULL OR to_regclass(v_ledger) IS NULL THEN
    RETURN QUERY SELECT 0::int;
    RETURN;
  END IF;

  -- supplier CH_ODEME: sign=-1 → +1 (borç azaltıcı).
  EXECUTE format('
    UPDATE %I pl SET sign = 1
    WHERE pl.transaction_type = ''CH_ODEME''
      AND pl.sign = -1
      AND EXISTS (
        SELECT 1 FROM %I cl
        WHERE cl.id = pl.cash_line_id
          AND cl.customer_id IS NULL
          AND cl.transaction_type = ''CH_ODEME''
      )
  ', v_ledger, v_cash);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- customer CH_TAHSILAT: sign=+1 → -1 (alacak azaltıcı) — nadiren yanlış.
  EXECUTE format('
    UPDATE %I pl SET sign = -1
    WHERE pl.transaction_type = ''CH_TAHSILAT''
      AND pl.sign = 1
      AND EXISTS (
        SELECT 1 FROM %I cl
        WHERE cl.id = pl.cash_line_id
          AND cl.customer_id IS NOT NULL
          AND cl.transaction_type = ''CH_TAHSILAT''
      )
  ', v_ledger, v_cash);

  RETURN QUERY SELECT v_n;
END;
$$ LANGUAGE plpgsql;

-- 3) Runner: tüm rex_<firm>_<period> tablolarını dolaş.
CREATE OR REPLACE FUNCTION rex_backfill_191_runner()
RETURNS TABLE(
  tablename text,
  account_inserted int,
  signs_fixed int
) AS $$
DECLARE
  r record;
  v_firm text;
  v_period text;
  v_n_account int;
  v_n_signs int;
BEGIN
  FOR r IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
    ORDER BY t.table_name
  LOOP
    v_firm := split_part(r.table_name, '_', 2);
    v_period := split_part(r.table_name, '_', 3);
    SELECT b.account_inserted INTO v_n_account
    FROM rex_backfill_account_movements_191(v_firm, v_period) AS b;
    SELECT s.signs_fixed INTO v_n_signs
    FROM rex_fix_party_ledger_signs_191(v_firm, v_period) AS s;
    tablename := r.table_name;
    account_inserted := COALESCE(v_n_account, 0);
    signs_fixed := COALESCE(v_n_signs, 0);
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4) Runner log — NOTICE ile psql çıktısı.
CREATE OR REPLACE FUNCTION rex_backfill_191_runner_log()
RETURNS void AS $$
DECLARE
  r record;
  v_total_account int := 0;
  v_total_signs int := 0;
BEGIN
  FOR r IN SELECT * FROM rex_backfill_191_runner() LOOP
    v_total_account := v_total_account + COALESCE(r.account_inserted, 0);
    v_total_signs := v_total_signs + COALESCE(r.signs_fixed, 0);
    RAISE NOTICE '[191] % → account_movements_inserted=%, ledger_signs_fixed=%',
      r.tablename, COALESCE(r.account_inserted, 0), COALESCE(r.signs_fixed, 0);
  END LOOP;
  RAISE NOTICE '[191] TOTAL account_movements_inserted=%, ledger_signs_fixed=%',
    v_total_account, v_total_signs;
END;
$$ LANGUAGE plpgsql;

-- 5) Çalıştır.
SELECT rex_backfill_191_runner_log();

-- 6) Yardımcı fonksiyonları temizle.
DROP FUNCTION IF EXISTS rex_backfill_191_runner_log();
DROP FUNCTION IF EXISTS rex_backfill_191_runner();
DROP FUNCTION IF EXISTS rex_fix_party_ledger_signs_191(text, text);
DROP FUNCTION IF EXISTS rex_backfill_account_movements_191(text, text);