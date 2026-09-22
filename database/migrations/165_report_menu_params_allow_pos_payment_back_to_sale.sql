-- POS: ödeme ekranından satışa geri dönüş izni
-- report_menu_params anahtarı `allow-pos-payment-back-to-sale`
-- Varsayılan: açık (true) → geri dönüşe izin (eski davranış; fiş iptal neden modalı)
-- Kapalı: geri butonu engellenir; fiş iptal modalı açılmaz.
-- Kolon migration 153 ile var; yalnızca eksik JSON anahtarını ekler.

UPDATE public.system_settings
SET
  report_menu_params =
    COALESCE(report_menu_params, '{}'::jsonb)
    || jsonb_build_object(
      'allow-pos-payment-back-to-sale', true
    ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND NOT (COALESCE(report_menu_params, '{}'::jsonb) ? 'allow-pos-payment-back-to-sale');

COMMENT ON COLUMN public.system_settings.report_menu_params IS
  'Menü/özellik parametreleri: beauty-*, debt-aging, collection-due, stock-aging, virtual-pbx-caller-id, stock-price-change-slips, product-list-sales-purchase-totals, print-use-windows-printer-service, block-negative-stock-sale (varsayılan kapalı=satılabilir), allow-pos-payment-back-to-sale (varsayılan açık=ödeme→satış geri dönüşe izin); daily-report-supplier-payments + daily-report-card-* + period-summary-card-* (varsayılan açık) → boolean.';

NOTIFY pgrst, 'reload schema';
