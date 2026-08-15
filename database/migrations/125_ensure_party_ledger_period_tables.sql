-- ============================================================================
-- 125: party_ledger + partner_distributions dönem tabloları (catch-up)
-- ============================================================================
-- 121 yalnızca *var olan* rex_*_*_party_ledger_movements tablolarına indeks
-- ekler; CREATE TABLE yok. CREATE_PERIOD_TABLES (000) yeni dönem açılışında
-- oluşturur, ama 121'den önce açılmış dönemlerde tablo hiç yoktur.
-- Örnek hata: relation "rex_001_01_party_ledger_movements" does not exist
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS.
-- Tauri: bu dosya yalnızca psql / db:migrate ile çalışır (DO $$ serbest).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.INIT_PARTY_PERIOD_TABLES(
  p_firm_nr VARCHAR,
  p_period_nr VARCHAR
)
RETURNS void AS $$
DECLARE
  v_firm TEXT := lower(trim(p_firm_nr));
  v_period TEXT := lower(trim(p_period_nr));
  v_prefix TEXT;
  v_ledger TEXT;
  v_dist TEXT;
  v_items TEXT;
BEGIN
  IF length(v_firm) <= 3 THEN
    v_firm := lpad(v_firm, 3, '0');
  END IF;
  IF length(v_period) <= 2 THEN
    v_period := lpad(v_period, 2, '0');
  END IF;

  v_prefix := 'rex_' || v_firm || '_' || v_period;
  v_ledger := v_prefix || '_party_ledger_movements';
  v_dist := v_prefix || '_partner_distributions';
  v_items := v_prefix || '_partner_distribution_items';

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.%I (
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
    )
  $sql$, v_ledger);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, period_nr, party_id, date)',
    v_prefix || '_party_ledger_firm_period_party_date_idx', v_ledger
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (transaction_type)',
    v_prefix || '_party_ledger_trtype_idx', v_ledger
  );

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.%I (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr             VARCHAR(10) NOT NULL,
      period_nr           VARCHAR(10) NOT NULL,
      distribution_date   DATE NOT NULL,
      base_type           VARCHAR(20) NOT NULL,
      base_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
      total_partner_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
      trigger_type        VARCHAR(20) NOT NULL,
      created_by          VARCHAR(100),
      notes               TEXT,
      reversed_by_id      UUID,
      created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  $sql$, v_dist);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (distribution_date)',
    v_prefix || '_partner_distributions_date_idx', v_dist
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, trigger_type)',
    v_prefix || '_partner_distributions_firm_trigger_idx', v_dist
  );

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS public.%I (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      distribution_id          UUID NOT NULL REFERENCES public.%I(id) ON DELETE CASCADE,
      partner_id               UUID NOT NULL,
      share_pct                NUMERIC(5,2) NOT NULL,
      amount                   DECIMAL(15,2) NOT NULL,
      cash_line_id             UUID,
      party_ledger_movement_id UUID,
      created_at               TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  $sql$, v_items, v_dist);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (distribution_id)',
    v_prefix || '_partner_distribution_items_dist_idx', v_items
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (partner_id)',
    v_prefix || '_partner_distribution_items_partner_idx', v_items
  );

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', v_ledger);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', v_dist);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon', v_items);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Mevcut tüm dönemler (cash_lines veya sales varsa dönem açıktır)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_cash_lines$'))[1] AS firm_nr,
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_cash_lines$'))[2] AS period_nr
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9a-z]+_[0-9a-z]+_cash_lines$'
  LOOP
    IF r.firm_nr IS NOT NULL AND r.period_nr IS NOT NULL THEN
      PERFORM public.INIT_PARTY_PERIOD_TABLES(r.firm_nr, r.period_nr);
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_sales$'))[1] AS firm_nr,
      (regexp_match(tablename, '^rex_([0-9a-z]+)_([0-9a-z]+)_sales$'))[2] AS period_nr
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9a-z]+_[0-9a-z]+_sales$'
  LOOP
    IF r.firm_nr IS NOT NULL AND r.period_nr IS NOT NULL THEN
      PERFORM public.INIT_PARTY_PERIOD_TABLES(r.firm_nr, r.period_nr);
    END IF;
  END LOOP;
END $$;
