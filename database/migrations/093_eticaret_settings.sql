-- E-ticaret vitrin ayarları (tema, demo kiracı, mağaza metinleri)
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS eticaret_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.system_settings.eticaret_settings IS
  'Online satış vitrin ayarları: activeThemeId, activeVariantId, demoMode, demoTenantCode, storeTitle, announcementText, enabled';
