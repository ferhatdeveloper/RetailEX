-- merkez_db: Logo REST API taban URL (internet / sabit IP)
-- Postman: POST /api/v1/token  grant_type=password&username&firmno&password (+ client_id/client_secret body)
-- Çalıştır: psql -d merkez_db -f database/scripts/merkez_tenant_registry_logo_rest_default.sql

UPDATE public.tenant_registry
SET
  logo_rest_api_url = 'http://185.206.80.132:32001/api/v1',
  updated_at = now()
WHERE logo_rest_api_url IS NULL OR trim(logo_rest_api_url) = '';

-- Belirli kiracılar (örnek)
UPDATE public.tenant_registry
SET logo_rest_api_url = 'http://185.206.80.132:32001/api/v1', updated_at = now()
WHERE code IN ('kasap', 'merkez', 'kupeli');
