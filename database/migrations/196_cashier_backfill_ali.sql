-- ============================================================================
-- Migration 196: kasap datası kasiyer backfill (ALI)
-- ----------------------------------------------------------------------------
-- Plan referansı: SalesInvoiceModule + kasap cashier backfill
-- (195 iptal edildi; kullanıcı 2026-10-03'te geri alarak 'ALI' ile
--  yeniden uygulanmasını istedi.)
--
-- Sorun:
--   * `MRK-20261003-M*` faturaları (kasap/kuyumcu perakende satışları)
--     `Perakende Satış` listesinde gösterilirken `cashier` kolonu %90 boş.
--   * Bu satırlar POS'tan geldiğinde `cashier` yazılmamış; kasiyer bilgisi
--     raporlarda/listede görünmüyor.
--
-- Neden gerekli:
--   * Satış listesi "Kasiyer" kolonunda görünürlük için.
--   * Günlük rapor / kasa hareketi filtrelerinde "ALI" ile sorgu doğru
--     sonuç dönsün.
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
--   * 'ALI' sabiti bilinçli olarak kullanıldı: Personel Değiştir
--     ekranında 'ALI OTHMAN' kayıtlı; ALI öncelikli kısa ad.
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
          SET cashier = ''ALI''
        WHERE firm_nr = ''001''
          AND COALESCE(is_cancelled, false) = false
          AND (cashier IS NULL OR TRIM(COALESCE(cashier, '''')) = '''')',
      r.tbl
    );
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    v_total := v_total + v_updated;
    RAISE NOTICE '[196] %: cashier IS NULL → ALI güncellendi = % satır',
      r.tbl, v_updated;
  END LOOP;

  RAISE NOTICE '[196] Toplam güncellenen satır: %', v_total;
END $$;

NOTIFY pgrst, 'reload schema';
