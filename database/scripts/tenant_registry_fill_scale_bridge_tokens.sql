-- merkez_db: tüm kiracılar için terazi köprü token (+ isteğe bağlı URL)
-- Token kuralı: rex-bridge-{code}
-- Mağaza PC scale-bridge.json authToken ile BİREBİR aynı olmalı.
--
-- Uzak PG:
--   PGPASSWORD='...' psql -h 72.60.182.107 -U postgres -d merkez_db -f database/scripts/tenant_registry_fill_scale_bridge_tokens.sql

UPDATE public.tenant_registry
SET
  scale_bridge_token = 'rex-bridge-' || code,
  updated_at = now()
WHERE code IN (
  'kasap', 'testere', 'mettu', 'canon', 'lovan',
  'berzin_com', 'aqua_beauty', 'retailex_demo'
)
AND (scale_bridge_token IS NULL OR scale_bridge_token = '');

-- Örnek köprü URL (yalnızca boş satırlara; gerçek mağaza LAN IP ile güncelleyin)
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
  updated_at = now()
WHERE code IN ('kasap', 'testere', 'mettu', 'canon', 'lovan')
  AND (scale_bridge_url IS NULL OR scale_bridge_url = '');

NOTIFY pgrst, 'reload schema';

SELECT code, scale_bridge_url, scale_bridge_token
FROM public.tenant_registry
WHERE scale_bridge_token IS NOT NULL AND scale_bridge_token <> ''
ORDER BY code;
