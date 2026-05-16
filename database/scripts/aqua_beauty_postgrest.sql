-- ============================================================================
-- aqua_beauty — PostgREST: anon rolü + logic.verify_login
-- aqua.sql (pg_dump) import edildikten SONRA çalıştırın.
-- Tek başına: psql -U postgres -d aqua_beauty -v ON_ERROR_STOP=1 -f aqua_beauty_postgrest.sql
-- ============================================================================

SET client_encoding = 'UTF8';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS logic;
CREATE SCHEMA IF NOT EXISTS wms;
CREATE SCHEMA IF NOT EXISTS rest;
CREATE SCHEMA IF NOT EXISTS beauty;
CREATE SCHEMA IF NOT EXISTS pos;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

DO $$
BEGIN
  IF current_database() <> 'aqua_beauty' THEN
    RAISE WARNING 'Beklenen veritabanı: aqua_beauty, şu an: %', current_database();
  END IF;
END $$;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO anon', current_database());
END $$;

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'logic', 'wms', 'rest', 'beauty', 'pos'] LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon', s);
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO anon', s);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO anon', s);
      EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO anon', s);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon',
        s);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO anon', s);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO anon', s);
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS logic.verify_login(text, text, text);

CREATE OR REPLACE FUNCTION logic.verify_login(
  username text,
  password text,
  firm_nr text
)
RETURNS TABLE (
  id uuid,
  username text,
  email text,
  full_name text,
  firm_nr text,
  store_id uuid,
  role_id uuid,
  role_name text,
  role_permissions jsonb,
  role_color text,
  role_landing_route text,
  allowed_firm_nrs jsonb,
  allowed_periods jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    u.id,
    u.username,
    u.email,
    u.full_name,
    u.firm_nr,
    u.store_id,
    r.id,
    r.name,
    r.permissions,
    r.color,
    r.landing_route,
    u.allowed_firm_nrs,
    u.allowed_periods,
    u.created_at
  FROM public.users u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE COALESCE(u.is_active, true)
    AND LOWER(u.username) = LOWER($1)
    AND u.password_hash IS NOT NULL
    AND u.password_hash = crypt($2, u.password_hash)
    AND (
      $3 IS NULL
      OR $3 = ''
      OR u.firm_nr = $3
      OR (
        COALESCE(jsonb_array_length(u.allowed_firm_nrs), 0) > 0
        AND u.allowed_firm_nrs @> jsonb_build_array($3)
      )
    )
  LIMIT 1;
$fn$;

GRANT EXECUTE ON FUNCTION logic.verify_login(text, text, text) TO anon;

NOTIFY pgrst, 'reload schema';

-- Kontrol (isteğe bağlı):
-- SELECT COUNT(*) FROM public.firms;
-- SELECT username FROM public.users LIMIT 5;
