-- ============================================================================
-- 150 — Firma bazlı kabuk modül listesi
-- ============================================================================
-- Her firma kendi üst kabuk modüllerini (pos, management, restaurant, beauty, …)
-- taşıyabilir. NULL = kiracı / localStorage varsayılanına düş.
-- WMS ve mobile-pos demo/aktif kabukta pasif tutulur (uygulama tarafı).

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT NULL;

COMMENT ON COLUMN public.firms.enabled_modules IS
  'Firma kabuk modülleri JSON dizi örn. ["pos","management"]. NULL = kiracı varsayılanı.';

NOTIFY pgrst, 'reload schema';
