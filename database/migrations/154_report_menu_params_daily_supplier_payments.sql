-- Günlük rapor: tedarikçiye ödenen tutarlar (CH_ODEME) parametresi — varsayılan açık
-- Kolon zaten migration 153 ile var; yalnızca JSON anahtarını mevcut satıra ekler (yoksa).

UPDATE public.system_settings
SET
  report_menu_params =
    COALESCE(report_menu_params, '{}'::jsonb)
    || jsonb_build_object('daily-report-supplier-payments', true),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND NOT (COALESCE(report_menu_params, '{}'::jsonb) ? 'daily-report-supplier-payments');

COMMENT ON COLUMN public.system_settings.report_menu_params IS
  'Menü/özellik parametreleri: beauty-*, virtual-pbx-caller-id, stock-price-change-slips, product-list-sales-purchase-totals (varsayılan kapalı); daily-report-supplier-payments (varsayılan açık) → boolean.';

NOTIFY pgrst, 'reload schema';
