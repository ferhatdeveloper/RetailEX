-- Beauty: Hizmet başına personel (uzman) prim yüzdesi.
-- Amaç: ServiceManagement'taki sabit `beauty_services.commission_rate` alanını
--        "personel başına yüzde" yapısına taşı. Aynı hizmeti farklı uzmanlar
--        farklı yüzdeler ile yapabilsin.
--
-- Kapsam:
--   * Yeni kart tablosu: `beauty.rex_{firmNr}_service_staff_commissions`
--     (her firma için ayrı). Composite PK `(service_id, staff_id)`.
--   * `percent` yüzde (0–100, 2 ondalık). NULL yerine 0 = "bu uzman için
--     tanımsız / varsayılan hizmet yüzdesine düş".
--   * Idempotent yardımcı fonksiyonlar:
--       - beauty.upsert_service_staff_commission(firm_nr, service_id,
--           staff_id, percent)
--       - beauty.delete_service_staff_commission(firm_nr, service_id, staff_id)
--   * Öncelik (uygulama tarafı):
--       satır override > service_staff_commission > service.commission_rate
--       > specialist.commission_rate
--
-- Hesaplama: indirim sonrası NET üzerinden (mevcut commission raporu ile aynı).
-- Muhasebe: commission_amount yalnızca rapor / hakediş; ledger işlemi değil.

SET search_path TO public, beauty;

DO $$
DECLARE
    v_firm TEXT;
BEGIN
    FOR v_firm IN
        SELECT lpad(trim(firm_nr::text), 3, '0')
          FROM public.firms
         WHERE COALESCE(is_active, true) = true
    LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS beauty.%I (
                service_id   UUID NOT NULL,
                staff_id     UUID NOT NULL,
                percent      NUMERIC(5,2) NOT NULL DEFAULT 0
                              CHECK (percent >= 0 AND percent <= 100),
                is_active    BOOLEAN NOT NULL DEFAULT true,
                notes        TEXT,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (service_id, staff_id)
            )',
            'rex_' || v_firm || '_service_staff_commissions'
        );

        -- Aktif yüzde araması için yardımcı indeks
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I
               ON beauty.%I (service_id)
              WHERE is_active = true',
            'rex_' || v_firm || '_service_staff_commissions_srv_active_idx',
            'rex_' || v_firm || '_service_staff_commissions'
        );

        -- Hizmet silinirse personellerin yüzdeleri de temizlensin
        EXECUTE format(
            'ALTER TABLE beauty.%I
                DROP CONSTRAINT IF EXISTS %I',
            'rex_' || v_firm || '_service_staff_commissions',
            'rex_' || v_firm || '_service_staff_commissions_service_fk'
        );
        EXECUTE format(
            'ALTER TABLE beauty.%I
                ADD CONSTRAINT %I
                FOREIGN KEY (service_id)
                REFERENCES beauty.%I (id) ON DELETE CASCADE',
            'rex_' || v_firm || '_service_staff_commissions',
            'rex_' || v_firm || '_service_staff_commissions_service_fk',
            'rex_' || v_firm || '_beauty_services'
        );

        EXECUTE format(
            'ALTER TABLE beauty.%I
                DROP CONSTRAINT IF EXISTS %I',
            'rex_' || v_firm || '_service_staff_commissions',
            'rex_' || v_firm || '_service_staff_commissions_staff_fk'
        );
        EXECUTE format(
            'ALTER TABLE beauty.%I
                ADD CONSTRAINT %I
                FOREIGN KEY (staff_id)
                REFERENCES beauty.%I (id) ON DELETE CASCADE',
            'rex_' || v_firm || '_service_staff_commissions',
            'rex_' || v_firm || '_service_staff_commissions_staff_fk',
            'rex_' || v_firm || '_beauty_specialists'
        );
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Yardımcı fonksiyonlar (firm_nr parametreli — Tauri / psql / pg uyumlu)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS beauty.upsert_service_staff_commission(TEXT, UUID, UUID, NUMERIC);
CREATE OR REPLACE FUNCTION beauty.upsert_service_staff_commission(
    p_firm_nr    TEXT,
    p_service_id UUID,
    p_staff_id   UUID,
    p_percent    NUMERIC
)
RETURNS TABLE (
    out_service_id UUID,
    out_staff_id   UUID,
    out_percent    NUMERIC,
    out_is_active  BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_firm TEXT := lpad(trim(COALESCE(p_firm_nr, '')), 3, '0');
    v_pct  NUMERIC(5,2);
BEGIN
    IF p_service_id IS NULL OR p_staff_id IS NULL THEN
        RAISE EXCEPTION 'service_id ve staff_id zorunlu';
    END IF;
    v_pct := GREATEST(0, LEAST(100, COALESCE(p_percent, 0)));
    IF v_pct <> ROUND(v_pct, 2) THEN
        v_pct := ROUND(v_pct, 2);
    END IF;

    EXECUTE format(
        'INSERT INTO beauty.%I (service_id, staff_id, percent, is_active, updated_at)
              VALUES ($1, $2, $3, true, NOW())
         ON CONFLICT (service_id, staff_id) DO UPDATE
                SET percent    = EXCLUDED.percent,
                    is_active  = true,
                    updated_at = NOW()',
        'rex_' || v_firm || '_service_staff_commissions'
    )
    USING p_service_id, p_staff_id, v_pct;

    RETURN QUERY EXECUTE format(
        'SELECT service_id, staff_id, percent, is_active
           FROM beauty.%I
          WHERE service_id = $1 AND staff_id = $2',
        'rex_' || v_firm || '_service_staff_commissions'
    )
    USING p_service_id, p_staff_id;
END;
$$;

DROP FUNCTION IF EXISTS beauty.delete_service_staff_commission(TEXT, UUID, UUID);
CREATE OR REPLACE FUNCTION beauty.delete_service_staff_commission(
    p_firm_nr    TEXT,
    p_service_id UUID,
    p_staff_id   UUID
)
RETURNS TABLE (out_service_id UUID, out_staff_id UUID, out_deleted BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
    v_firm TEXT := lpad(trim(COALESCE(p_firm_nr, '')), 3, '0');
    v_affected INTEGER;
BEGIN
    EXECUTE format(
        'DELETE FROM beauty.%I
          WHERE service_id = $1 AND staff_id = $2',
        'rex_' || v_firm || '_service_staff_commissions'
    )
    USING p_service_id, p_staff_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    RETURN QUERY SELECT p_service_id, p_staff_id, (v_affected > 0);
END;
$$;

-- ----------------------------------------------------------------------------
-- Yetki (anon rolü varsa) — readonly çağrı için GRANT EXECUTE
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT EXECUTE ON FUNCTION beauty.upsert_service_staff_commission(TEXT, UUID, UUID, NUMERIC) TO anon;
        GRANT EXECUTE ON FUNCTION beauty.delete_service_staff_commission(TEXT, UUID, UUID) TO anon;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';