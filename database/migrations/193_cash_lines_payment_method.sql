-- ============================================================================
-- Migration 193: cash_lines.payment_method kolonu + eski veriler için fallback
-- ----------------------------------------------------------------------------
-- Plan referansı:
--   Bug 28 — Kasa İşlemleri "Ödeme Tipi" kolonu gerçek veriden beslenmeli.
--   Bug 25 (`cashLinePaymentType.ts`) bu kolonu varsaymıştı; ancak DB'de
--   kolon yoktu → UI her zaman "—" görüyordu.
--
-- Neden gerekli:
--   * `cash_lines.payment_method` ham değeri (cash / card / veresiye /
--     havale / eft / transfer) Kasa İşlemleri modülünde Ödeme Tipi
--     kolonunu besler; bu kolon olmadan resolvePaymentType her zaman
--     "Belgesel" fallback'ine düşer.
--   * Migration 193 ile kolon eklenir; default null (geriye dönük uyumlu).
--   * Eski fişler için transaction_type bazlı backfill: KASA_GIRIS +
--     definition'da 'Nakit' / 'Cash' → 'cash'; 'Kart' / 'Card' → 'card';
--     'Havale' / 'EFT' / 'Transfer' → 'transfer'; 'Veresiye' → 'veresiye'.
--     Heuristik başarısızsa null bırakılır → UI 'Belgesel' fallback'i
--     göstermeye devam eder.
--
-- Yeni kolon (her rex_<firmNr>_<periodNr>_cash_lines tablosuna):
--   payment_method VARCHAR(50)  -- 'cash' | 'card' | 'veresiye' |
--                                 -- 'havale' | 'eft' | 'transfer' | null
-- ============================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);',
      r.tbl
    );
  END LOOP;
END $$;

-- Geriye dönük backfill (her tablo için). Definition içinde anahtar kelime
-- yakalanır; bulunamazsa null bırakılır (UI fallback zaten bunu 'Belgesel'
-- rozet olarak gösteriyor).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
  LOOP
    EXECUTE format(
      $sql$
      UPDATE public.%I
         SET payment_method = CASE
           WHEN payment_method IS NOT NULL THEN payment_method
           WHEN transaction_type IN ('SATIS_FATURASI','HIZMET_FATURASI','ALIS_FATURASI') THEN NULL
           WHEN definition ILIKE ANY (ARRAY['%%Nakit%%','%%Cash%%']) THEN 'cash'
           WHEN definition ILIKE ANY (ARRAY['%%Kart%%','%%Card%%']) THEN 'card'
           WHEN definition ILIKE ANY (ARRAY['%%Veresiye%%','%%Cari%%']) THEN 'veresiye'
           WHEN definition ILIKE ANY (ARRAY['%%Havale%%','%%EFT%%','%%Transfer%%']) THEN 'transfer'
           ELSE NULL
         END
       WHERE payment_method IS NULL
      $sql$,
      r.tbl
    );
  END LOOP;
END $$;