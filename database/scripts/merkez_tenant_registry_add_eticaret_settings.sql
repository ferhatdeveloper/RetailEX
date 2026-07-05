-- merkez_db.tenant_registry: kiracı bazlı online satış vitrin ayarları
-- Uygulama: merkez PostgREST üzerinden PATCH ile güncellenir.
--
-- Örnek:
--   PGPASSWORD='...' psql -h <host> -U postgres -d merkez_db -f database/scripts/merkez_tenant_registry_add_eticaret_settings.sql

SET client_encoding = 'UTF8';

ALTER TABLE public.tenant_registry
  ADD COLUMN IF NOT EXISTS eticaret_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenant_registry.eticaret_settings IS
  'Kiracı online satış vitrin ayarları: activeThemeId, activeVariantId, enabled, storeTitle, announcementText';

-- Perakende kiracılara varsayılan Ella teması (idempotent)
UPDATE public.tenant_registry
SET
  eticaret_settings = COALESCE(eticaret_settings, '{}'::jsonb)
    || jsonb_build_object(
      'activeThemeId', 'ella',
      'activeVariantId', 'ella-classic',
      'enabled', true,
      'storeTitle', display_name,
      'announcementText', 'Online satış mağazamıza hoş geldiniz.'
    ),
  updated_at = now()
WHERE module IN ('retail', 'market')
  AND is_active IS DISTINCT FROM false
  AND (
    eticaret_settings IS NULL
    OR eticaret_settings = '{}'::jsonb
    OR NOT (eticaret_settings ? 'activeVariantId')
  );

SELECT code, display_name, module, eticaret_settings->>'activeVariantId' AS variant, eticaret_settings->>'enabled' AS enabled
FROM public.tenant_registry
WHERE module IN ('retail', 'market')
ORDER BY display_name;
