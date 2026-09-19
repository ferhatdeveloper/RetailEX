-- Rapor menüsü parametreleri: güzellik anket / aranmayanlar raporlarının menü görünürlüğü
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS report_menu_params JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.system_settings.report_menu_params IS
  'Rapor menüsü parametreleri (varsayılan kapalı): beauty-overdue-uncalled-report, beauty-survey-report, beauty-survey-trend-report, beauty-survey-staff-report, beauty-survey-service-report, beauty-survey-nps-report, beauty-survey-comments-report → boolean.';

NOTIFY pgrst, 'reload schema';
