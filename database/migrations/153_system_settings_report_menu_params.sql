-- Menü görünürlük parametreleri: güzellik anket/aranmayanlar + sanal santral + fiyat değişimi
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS report_menu_params JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.system_settings.report_menu_params IS
  'Menü/özellik parametreleri (varsayılan kapalı): beauty-overdue-uncalled-report, beauty-survey-*, virtual-pbx-caller-id, stock-price-change-slips, product-list-sales-purchase-totals → boolean.';

NOTIFY pgrst, 'reload schema';
