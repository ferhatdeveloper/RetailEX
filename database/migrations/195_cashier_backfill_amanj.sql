-- ============================================================================
-- Migration 195: kasap datası kasiyer backfill (amanj)
-- ----------------------------------------------------------------------------
-- Plan referansı: SalesInvoiceModule + kasap cashier backfill
--
-- Sorun:
--   * `MRK-20261003-M*` faturaları (kasap/kuyumcu perakende satışları)
--     `Perakende Satış` listesinde gösterilirken `cashier` kolonu %90 boş.
--   * Bu satırlar POS'tan geldiğinde `cashier` yazılmamış; giriş yapan
--     kullanıcı (amanj) sonradan fatura listesinde görünmüyor.
--   * Güzellik tarafında aynı kullanıcı doğru yazılmış; kasap datasında
--     geriye dönük `cashier = 'amanj'` atanmalı.
--
-- Neden gerekli:
--   * Satış listesi "Kasiyer" kolonunda kasiyer görünürlüğü için.
--   * Günlük rapor / kasa hareketi filtrelerinde "amanj" ile sorgu
--     doğru sonuç dönsün.
--   * SalesInvoiceModule header'a "Satış Elemanı" + "Ödeme Tipi"
--     eklendikten sonra geriye dönük datasız satırlar raporları bozar.
--
-- Kapsam (firm_nr bazlı, kasap):
--   * Yalnızca `firm_nr = '001'` (BAGHDAD / kasap kiracısı) güncellenir.
--   * Yalnızca `cashier IS NULL OR TRIM(cashier) = ''` koşulundaki satırlar
--     güncellenir; mevcut değerler KORUNUR.
--   * `is_cancelled = false` olan satırlar (iptal edilenler kasiyersiz kalır).
--   * Tüm `rex_001_*_sales` dönem tabloları için uygulanır
--     (firm 001; dönem 01..99).
--
-- Not:
--   * 'amanj' sabiti bilinçli olarak kullanıldı: güzellik tarafında da aynı
--     kullanıcı kasiyer olarak yazılıyor (auth.users.username veya
--     sales_reps.name ile eşleşir).
--   * Master şema güncellemesi gerekmez (veri backfill, şema değişikliği yok).
--
-- İdempotent:
--   * WHERE cashier IS NULL guard trimüslü boş string kontrolü.
--   * Tekrar çalıştırılırsa 0 satır günceller.
-- ============================================================================

DO $$
DECLARE r record;
  v_updated INT;
  v_total   INT := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^rex_001_[0-9]+_sales$'
  LOOP
    EXECUTE format(
      'UPDATE public.%I
          SET cashier = ''amanj''
        WHERE firm_nr = ''001''
          AND COALESCE(is_cancelled, false) = false
          AND (cashier IS NULL OR TRIM(COALESCE(cashier, '''')) = '''')',
      r.tbl
    );
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_total := v_total + v_updated;
    RAISE NOTICE '[195] %: cashier IS NULL → amanj güncellendi = % satır',
      r.tbl, v_updated;
  END LOOP;

  RAISE NOTICE '[195] Toplam güncellenen satır: %', v_total;
END $$;

NOTIFY pgrst, 'reload schema';