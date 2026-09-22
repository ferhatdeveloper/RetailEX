-- Stok / satış: negatif veya sıfır stokla satış engeli
-- report_menu_params anahtarı `block-negative-stock-sale`
-- Varsayılan: kapalı (false) → satılabilir (eski davranış)
-- Kolon migration 153 ile var; yalnızca eksik JSON anahtarını ekler.

UPDATE public.system_settings
SET
  report_menu_params =
    COALESCE(report_menu_params, '{}'::jsonb)
    || jsonb_build_object(
      'block-negative-stock-sale', false
    ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND NOT (COALESCE(report_menu_params, '{}'::jsonb) ? 'block-negative-stock-sale');

COMMENT ON COLUMN public.system_settings.report_menu_params IS
  'Menü/özellik parametreleri: beauty-*, debt-aging, collection-due, stock-aging, virtual-pbx-caller-id, stock-price-change-slips, product-list-sales-purchase-totals, print-use-windows-printer-service, block-negative-stock-sale (varsayılan kapalı=satılabilir); daily-report-supplier-payments + daily-report-card-* + period-summary-card-* (varsayılan açık) → boolean.';

NOTIFY pgrst, 'reload schema';
