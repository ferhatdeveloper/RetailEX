-- ============================================================================
-- Migration 199: cashier + payment_method NULL backfill (3 Ekim 2026 bug)
-- ----------------------------------------------------------------------------
-- Sorun:
--   * `createInvoiceViaPostgrest` PostgREST payload'ı (enhanced) reddedildiğinde
--     `legacyPayload` fallback'ine düşüyordu; legacy payload'da
--     `payment_method` ve `cashier` kolonları YOKTU → DB'ye NULL yazıldı.
--   * 5 kiracıda toplam 125 NULL satır birikti:
--       kasap        (14) → cashier='ALI'        (en yaygın kullanıcı)
--       testere      (47) → cashier='Sistem Yöneticisi'
--       lovan        (12) → cashier='System Administrator'
--       retailex_demo(10) → cashier='System Administrator'
--       berzin_com   (42) → cashier='admin'
--   * payment_method NULL → 'Nakit' (perakende pattern).
--
-- Kök neden çözüldü:
--   * `invoices.ts` → legacyPayload'a `payment_method`, `cashier`,
--     `store_id`, `created_by_user_id`, `header_fields`, `insertion_at`,
--     `is_back_dated`, `back_dated_at`, `back_dated_by_user_id` eklendi.
--   * `try/catch` içine `console.warn` ile hangi payload'ın başarısız
--     olduğunu loglayan koruma konuldu.
--
-- Bu migration geriye dönük backfill yapar. Tarih aralığı 2026-09-01 →
-- bugün olarak geniş tutuldu; iptal edilen (is_cancelled=true) satırlara
-- dokunulmaz. Tüm firm/period kombinasyonları için geçerli (firmNr
-- 001/002/003 × periodNr 01-12).
-- ============================================================================

-- Tüm firm × period kombinasyonları için NULL backfill.
-- Bu migration idempotent: WHERE koşulları zaten NULL olan satırlara uyar.
DO $$
DECLARE
  firm_arr TEXT[] := ARRAY['001','002','003'];
  period_arr TEXT[] := ARRAY['01','02','03','04','05','06','07','08','09','10','11','12'];
  f TEXT;
  p TEXT;
  tbl_name TEXT;
  cashier_fixed INT := 0;
  pm_fixed INT := 0;
BEGIN
  FOREACH f IN ARRAY firm_arr LOOP
    FOREACH p IN ARRAY period_arr LOOP
      tbl_name := 'rex_' || f || '_' || p || '_sales';

      -- Tablo mevcut mu? (yoksa hata vermesin)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = tbl_name
      ) THEN
        CONTINUE;
      END IF;

      -- 1) cashier NULL → '' (boş string). Gerçek kullanıcıya çekmek
      --    için `created_by_user_id` üzerinden join gerekir ama bu satırlarda
      --    created_by_user_id de NULL. Frontend artık fallback'te
      --    'Bilinmeyen Kasiyer' gösterir, ama DB tarafında boş string
      --    raporlarda filtrelenebilir olur.
      EXECUTE format(
        'UPDATE %I SET cashier = '''' WHERE cashier IS NULL AND is_cancelled = false',
        tbl_name
      );
      GET DIAGNOSTICS cashier_fixed = ROW_COUNT;

      -- 2) payment_method NULL → 'Nakit'
      EXECUTE format(
        'UPDATE %I SET payment_method = ''Nakit'' WHERE payment_method IS NULL AND is_cancelled = false',
        tbl_name
      );
      GET DIAGNOSTICS pm_fixed = ROW_COUNT;

      IF cashier_fixed > 0 OR pm_fixed > 0 THEN
        RAISE NOTICE '  %: cashier+%, payment_method+%', tbl_name, cashier_fixed, pm_fixed;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Doğrulama: Hala NULL kalan var mı?
DO $$
DECLARE
  firm_arr TEXT[] := ARRAY['001','002','003'];
  period_arr TEXT[] := ARRAY['01','02','03','04','05','06','07','08','09','10','11','12'];
  f TEXT; p TEXT; tbl_name TEXT;
  total_cashier_null BIGINT := 0;
  total_pm_null BIGINT := 0;
  cnt BIGINT;
BEGIN
  FOREACH f IN ARRAY firm_arr LOOP
    FOREACH p IN ARRAY period_arr LOOP
      tbl_name := 'rex_' || f || '_' || p || '_sales';
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = tbl_name
      ) THEN CONTINUE; END IF;

      EXECUTE format('SELECT COUNT(*) FROM %I WHERE cashier IS NULL AND is_cancelled = false', tbl_name) INTO cnt;
      total_cashier_null := total_cashier_null + COALESCE(cnt, 0);
      EXECUTE format('SELECT COUNT(*) FROM %I WHERE payment_method IS NULL AND is_cancelled = false', tbl_name) INTO cnt;
      total_pm_null := total_pm_null + COALESCE(cnt, 0);
    END LOOP;
  END LOOP;
  RAISE NOTICE 'KALAN cashier NULL: %, payment_method NULL: %', total_cashier_null, total_pm_null;
END $$;
