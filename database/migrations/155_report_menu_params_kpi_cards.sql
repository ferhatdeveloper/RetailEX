-- Günlük / dönem özet rapor KPI kartları — report_menu_params anahtarları (varsayılan açık)
-- Kolon migration 153 ile var; yalnızca eksik JSON anahtarlarını ekler.

UPDATE public.system_settings
SET
  report_menu_params =
    COALESCE(report_menu_params, '{}'::jsonb)
    || jsonb_build_object(
      'daily-report-card-total-sales', true,
      'daily-report-card-total-revenue', true,
      'daily-report-card-total-discount', true,
      'daily-report-card-cash', true,
      'daily-report-card-card', true,
      'daily-report-card-sales-return', true,
      'daily-report-card-document-amount', true,
      'daily-report-card-amount-collected', true,
      'daily-report-card-remaining-account', true,
      'daily-report-card-total-expense', true,
      'daily-report-card-cash-expenses', true,
      'daily-report-card-net', true,
      'period-summary-card-total-revenue', true,
      'period-summary-card-total-expenses', true,
      'period-summary-card-period-purchases', true,
      'period-summary-card-supplier-payables', true,
      'period-summary-card-net', true,
      'period-summary-card-payment-split', true
    ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND (
    NOT (COALESCE(report_menu_params, '{}'::jsonb) ? 'daily-report-card-total-sales')
    OR NOT (COALESCE(report_menu_params, '{}'::jsonb) ? 'period-summary-card-total-revenue')
  );

COMMENT ON COLUMN public.system_settings.report_menu_params IS
  'Menü/özellik parametreleri: beauty-*, virtual-pbx-caller-id, stock-price-change-slips, product-list-sales-purchase-totals (varsayılan kapalı); daily-report-supplier-payments + daily-report-card-* + period-summary-card-* (varsayılan açık) → boolean.';

NOTIFY pgrst, 'reload schema';
