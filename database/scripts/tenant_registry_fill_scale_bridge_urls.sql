-- merkez_db: kiracı varsayılan terazi köprü URL + token
-- Mağaza PC IP'lerini gerçek değerlerle güncelleyin; token scale-bridge.json authToken ile aynı olmalı.

UPDATE public.tenant_registry
SET
  scale_bridge_url = CASE code
    WHEN 'kasap'   THEN 'http://192.168.1.50:3012'
    WHEN 'testere' THEN 'http://192.168.1.51:3012'
    WHEN 'mettu'   THEN 'http://192.168.1.52:3012'
    WHEN 'canon'   THEN 'http://192.168.1.54:3012'
    WHEN 'lovan'   THEN 'http://192.168.1.55:3012'
    ELSE scale_bridge_url
  END,
  scale_bridge_token = CASE code
    WHEN 'kasap'   THEN 'rex-bridge-kasap'
    WHEN 'testere' THEN 'rex-bridge-testere'
    WHEN 'mettu'   THEN 'rex-bridge-mettu'
    WHEN 'canon'   THEN 'rex-bridge-canon'
    WHEN 'lovan'   THEN 'rex-bridge-lovan'
    ELSE scale_bridge_token
  END,
  updated_at = now()
WHERE code IN ('kasap', 'testere', 'mettu', 'canon', 'lovan')
  AND (
    scale_bridge_url IS NULL OR scale_bridge_url = ''
    OR scale_bridge_token IS NULL OR scale_bridge_token = ''
  );

SELECT code, display_name, scale_bridge_url,
       CASE WHEN scale_bridge_token IS NOT NULL AND scale_bridge_token <> '' THEN '***' ELSE '' END AS token_set
FROM public.tenant_registry
WHERE code IN ('kasap', 'testere', 'mettu', 'canon', 'lovan')
ORDER BY code;
