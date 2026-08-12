-- merkez_db: PostgREST db-anon-role=anon için yalnızca public (logic/wms yok).
-- tenant_registry okuması (giriş / firma çözümleme).
-- Tam şema için: database/migrations/007_postgrest_anon_role.sql (kiracı DB'lerde).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE tenant_registry TO anon;
