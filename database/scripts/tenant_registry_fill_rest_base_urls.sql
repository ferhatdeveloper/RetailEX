-- merkez_db.tenant_registry: rest_api + rest_base_url (Caddy path = /{code}/*, aqua özel)
-- Önkoşul: api sunucusunda her kiracı için PostgREST + Caddy handle_path (berqenas-caddy-merge-merkez-api.sh)
--
-- Tabanı değiştirmek için aşağıdaki https://api.retailex.app ifadesini tek seferde değiştirin.

SET client_encoding = 'UTF8';

UPDATE public.tenant_registry
SET
  connection_provider = 'rest_api',
  rest_base_url = CASE code
    WHEN 'merkez' THEN 'https://api.retailex.app/merkez'
    WHEN 'aqua_beauty' THEN 'https://api.retailex.app/aqua'
    WHEN 'bestcom' THEN 'https://api.retailex.app/bestcom'
    ELSE 'https://api.retailex.app/' || code
  END,
  db_host = NULL,
  db_port = NULL,
  db_user = NULL,
  db_pass = NULL,
  db_sslmode = NULL,
  updated_at = now()
WHERE is_active IS DISTINCT FROM false
  AND (
    connection_provider IS DISTINCT FROM 'rest_api'
    OR rest_base_url IS NULL
    OR TRIM(rest_base_url) = ''
  );

SELECT code, connection_provider, rest_base_url, database_name
FROM public.tenant_registry
ORDER BY code;
