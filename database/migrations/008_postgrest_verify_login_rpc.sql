-- ============================================================================
-- RetailEX — POSTGREST RPC: verify_login
-- ============================================================================
-- Bu migration PostgREST ile güvenli şekilde login doğrulamak için:
--   POST/GET /rpc/verify_login?username=...&password=...&firm_nr=...
--
-- Not: Bu fonksiyon password_hash döndürmez, sadece yetkili kullanıcı bilgisini döndürür.
-- ============================================================================

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
AS $$
  SELECT
    u.id,
    u.username,
    u.email,
    u.full_name,
    u.firm_nr,
    u.store_id,
    r.id AS role_id,
    r.name AS role_name,
    r.permissions AS role_permissions,
    r.color AS role_color,
    r.landing_route AS role_landing_route,
    u.allowed_firm_nrs,
    u.allowed_periods,
    u.created_at
  FROM public.users u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE
    u.is_active = true
    AND LOWER(u.username) = LOWER(username)
    AND u.password_hash IS NOT NULL
    AND u.password_hash = crypt(password, u.password_hash)
    AND (
      firm_nr IS NULL OR firm_nr = ''
      OR (
        u.firm_nr = firm_nr::text
        OR (
          COALESCE(jsonb_array_length(u.allowed_firm_nrs), 0) > 0
          AND u.allowed_firm_nrs @> jsonb_build_array(firm_nr::text)
        )
        OR (
          COALESCE(jsonb_array_length(COALESCE(u.allowed_firm_nrs, '[]'::jsonb)), 0) = 0
          AND u.firm_nr = firm_nr::text
        )
      )
    )
  LIMIT 1;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION logic.verify_login(text, text, text) TO anon;

