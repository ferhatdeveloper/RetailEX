-- Finansal raporlar — Borç/Alacak Yaşlandırma + Vade/Tahsilat Takibi
-- report_menu_params anahtarları (varsayılan kapalı → Raporlar menüsünde gizli)
-- Kolon migration 153 ile var; yalnızca eksik JSON anahtarlarını ekler.

UPDATE public.system_settings
SET
  report_menu_params =
    COALESCE(report_menu_params, '{}'::jsonb)
    || jsonb_build_object(
      'debt-aging', false,
      'collection-due', false
    ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND (
    NOT (COALESCE(report_menu_params, '{}'::jsonb) ? 'debt-aging')
    OR NOT (COALESCE(report_menu_params, '{}'::jsonb) ? 'collection-due')
  );

COMMENT ON COLUMN public.system_settings.report_menu_params IS
  'Menü/özellik parametreleri: beauty-*, debt-aging, collection-due, virtual-pbx-caller-id, stock-price-change-slips, product-list-sales-purchase-totals, print-use-windows-printer-service (varsayılan kapalı); daily-report-supplier-payments + daily-report-card-* + period-summary-card-* (varsayılan açık) → boolean.';

NOTIFY pgrst, 'reload schema';
