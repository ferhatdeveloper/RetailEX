-- 143_drop_auto_cash_line_trigger.sql
--
-- 2026-09-01 — Kullanıcı geri bildirimi: trigger değil, kod tarafında
-- (Market POS ödeme modalı pattern'i) çözüm istiyor.
--
-- 142'de oluşturulan `trg_auto_cash_line_sales` tetikleyicisi ve
-- bağlı `public.fn_auto_cash_line_on_sale()` fonksiyonu kaldırılır.
-- Önceden backfill edilmiş `cash_lines` kayıtları KORUNUR.
--
-- Kod tarafında güvence:
--   * `writeCashRegisterLineForInvoice` (src/services/api/invoices.ts)
--     hem `db` (postgres.query) hem `rest_api` (postgrest.post/patch)
--     yollarını destekler; UNIQUE(fiche_no) → UPDATE fallback, transient
--     hata → 3 deneme + exponential backoff içerir.
--   * `InvoicePaymentInfoModal` üzerinden `cash_register_id` zorunlu
--     seçildiğinde (NAKIT / KREDIKARTI), bu bilgi header_fields JSONB
--     içinde fatura ile birlikte kaydedilir ve createInvoice zincirinde
--     writeCashRegisterLineForInvoice'a iletilir.

SET search_path TO public;

DROP TRIGGER IF EXISTS trg_auto_cash_line_sales ON public.rex_001_01_sales;
DROP FUNCTION IF EXISTS public.fn_auto_cash_line_on_sale();
