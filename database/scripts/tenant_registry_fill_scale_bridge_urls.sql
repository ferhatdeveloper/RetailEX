-- merkez_db: kiracı varsayılan köprü URL örnekleri (mağaza PC IP''lerini güncelleyin)
-- Çalıştırma: psql -d merkez_db -f database/scripts/tenant_registry_fill_scale_bridge_urls.sql

UPDATE public.tenant_registry
SET
  scale_bridge_url = CASE code
    WHEN 'kasap'   THEN 'http://192.168.1.50:3012'
    WHEN 'testere' THEN 'http://192.168.1.51:3012'
    WHEN 'mettu'   THEN 'http://192.168.1.52:3012'
    WHEN 'jiber'   THEN 'http://192.168.1.53:3012'
    WHEN 'canon'   THEN 'http://192.168.1.54:3012'
    WHEN 'lovan'   THEN 'http://192.168.1.55:3012'
    ELSE scale_bridge_url
  END,
  updated_at = now()
WHERE code IN ('kasap', 'testere', 'mettu', 'jiber', 'canon', 'lovan')
  AND (scale_bridge_url IS NULL OR scale_bridge_url = '');

SELECT code, display_name, scale_bridge_url,
       CASE WHEN scale_bridge_token IS NOT NULL AND scale_bridge_token <> '' THEN '***' ELSE '' END AS token_set
FROM public.tenant_registry
WHERE code IN ('kasap', 'testere', 'mettu', 'jiber', 'canon', 'lovan')
ORDER BY code;
