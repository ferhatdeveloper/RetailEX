-- ============================================================================
-- Migration 218: ClinicERP Müşteri listesi performans
-- ============================================================================
-- Sorun: ClientCRM açılışında tüm randevu satırları çekiliyor / SQL'de
-- müşteri başına correlated last_service subquery + client_id indeksi yok.
--
-- Çözüm:
--   1) beauty.crm_customer_visit_stats(firm, period) — DB'de COUNT + DISTINCT ON
--   2) Tüm beauty.rex_*_*_beauty_appointments için
--      (client_id, appointment_date DESC, appointment_time DESC) indeksi
--
-- Idempotent. PostgREST: NOTIFY pgrst.
-- ============================================================================

CREATE OR REPLACE FUNCTION beauty.crm_customer_visit_stats(
    p_firm_nr   TEXT,
    p_period_nr TEXT
)
RETURNS TABLE (
    client_id uuid,
    appointment_count integer,
    last_appointment_date date,
    last_service_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = beauty, public
AS $$
DECLARE
    v_firm   TEXT := lpad(trim(COALESCE(p_firm_nr, '')), 3, '0');
    v_period TEXT := lpad(trim(COALESCE(p_period_nr, '')), 2, '0');
    v_apt    TEXT := 'rex_' || v_firm || '_' || v_period || '_beauty_appointments';
    v_svc    TEXT := 'rex_' || v_firm || '_beauty_services';
    v_sfirm  TEXT := 'rex_' || v_firm || '_services';
    v_prod   TEXT := 'rex_' || v_firm || '_products';
BEGIN
    IF v_firm !~ '^[0-9]{3}$' OR v_period !~ '^[0-9]{2}$' THEN
        RAISE EXCEPTION 'crm_customer_visit_stats: geçersiz firm/period % / %', p_firm_nr, p_period_nr;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.tables
         WHERE table_schema = 'beauty'
           AND table_name = v_apt
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY EXECUTE format(
        $q$
        WITH apt_agg AS (
            SELECT
                a.client_id,
                COUNT(*)::int AS appointment_count,
                MAX(a.appointment_date) AS last_appointment_date
            FROM beauty.%I a
            WHERE a.client_id IS NOT NULL
            GROUP BY a.client_id
        ),
        last_apt AS (
            SELECT DISTINCT ON (a.client_id)
                a.client_id,
                a.service_id
            FROM beauty.%I a
            WHERE a.client_id IS NOT NULL
            ORDER BY a.client_id,
                     a.appointment_date DESC NULLS LAST,
                     a.appointment_time DESC NULLS LAST
        )
        SELECT
            aa.client_id,
            aa.appointment_count,
            aa.last_appointment_date,
            COALESCE(sb.name, sf.name, pr.name)::text AS last_service_name
        FROM apt_agg aa
        LEFT JOIN last_apt la ON la.client_id = aa.client_id
        LEFT JOIN beauty.%I sb ON sb.id = la.service_id
        LEFT JOIN public.%I sf ON sf.id = la.service_id
        LEFT JOIN public.%I pr ON pr.id = la.service_id
        $q$,
        v_apt, v_apt, v_svc, v_sfirm, v_prod
    );
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT EXECUTE ON FUNCTION beauty.crm_customer_visit_stats(TEXT, TEXT) TO anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION beauty.crm_customer_visit_stats(TEXT, TEXT) TO authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
        GRANT EXECUTE ON FUNCTION beauty.crm_customer_visit_stats(TEXT, TEXT) TO authenticator;
    END IF;
END $$;

-- Mevcut dönem randevu tablolarına client_id indeksi
DO $$
DECLARE
    r RECORD;
    idx_name TEXT;
BEGIN
    FOR r IN
        SELECT table_name
          FROM information_schema.tables
         WHERE table_schema = 'beauty'
           AND table_name ~ '^rex_[0-9]{3}_[0-9]{2}_beauty_appointments$'
    LOOP
        idx_name := r.table_name || '_client_date_idx';
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON beauty.%I (client_id, appointment_date DESC NULLS LAST, appointment_time DESC NULLS LAST)',
            idx_name,
            r.table_name
        );
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
