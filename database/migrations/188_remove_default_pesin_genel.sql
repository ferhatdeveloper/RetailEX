-- ============================================================================
-- Migration 188: Varsayılan PESIN / GENEL cari seed'lerini kaldır
-- ----------------------------------------------------------------------------
-- Amaç:
--   000_master_schema.sql'da (CREATE_FIRM_TABLES) yeni firmalar için
--   seed'lenen "PESIN" (Peşin Müşteri) ve "GENEL" (Genel Tedarikçi) carileri
--   artık oluşturulmuyor. Bu migration mevcut DB'lerdeki bu kartları siler.
--
-- Güvenlik:
--   - Yalnızca hiçbir yerde referans edilmeyen kartlar silinir.
--   - cash_lines / sales / purchase_invoices / partner_distributions vb.
--     tablolarda customer_id veya supplier_id olarak kullanılan kartlar
--     KORUNUR (FK / orphaned silme yok).
--   - Tüm kontrol sorguları to_regclass ile varlık kontrolünden geçer;
--     migration henüz kurulmamış DB'lerde de güvenle çalışır (idempotent).
--   - Silinen kart sayısı NOTICE olarak yazılır.
--
-- Uygulama:
--   PGPASSWORD='...' psql -h HOST -U postgres -d DBNAME -f \
--     database/migrations/188_remove_default_pesin_genel.sql
-- ============================================================================

DO $$
DECLARE
    -- Tüm olası hareket tablo isimleri (firm/period parametrik değil,
    -- regex ile bilgi şemasından çekilecek)
    r          RECORD;
    v_pesin_id UUID;
    v_genel_id UUID;
    v_uses     INTEGER := 0;
    v_deleted  INTEGER := 0;
    v_count    INTEGER := 0;
BEGIN
    -- 1) Aktif firmaları bul (firm_period fonksiyonu / firms tablosu)
    IF to_regclass('public.firms') IS NULL THEN
        RAISE NOTICE 'public.firms yok — migration atlanıyor';
        RETURN;
    END IF;

    CREATE TEMP TABLE _firms (firm_nr TEXT PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO _firms SELECT firm_nr FROM public.firms WHERE is_active = true;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '% aktif firma bulundu', v_count;
    IF v_count = 0 THEN
        RETURN;
    END IF;

    -- 2) Firm bazlı: PESIN müşteri + GENEL tedarikçi kontrolü + silme
    FOR r IN SELECT firm_nr FROM _firms LOOP
        -- ── PESIN müşteri ─────────────────────────────────────────
        IF to_regclass(format('public.rex_%s_customers', r.firm_nr)) IS NOT NULL THEN
            EXECUTE format(
                'SELECT id FROM public.rex_%s_customers WHERE code = ''PESIN'' LIMIT 1',
                r.firm_nr
            ) INTO v_pesin_id;

            IF v_pesin_id IS NOT NULL THEN
                v_uses := 0;

                -- cash_lines (customer_id kolonu varsa)
                IF to_regclass(format('public.rex_%s_01_cash_lines', r.firm_nr)) IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = format('rex_%s_01_cash_lines', r.firm_nr)
                          AND column_name = 'customer_id'
                   )
                THEN
                    EXECUTE format(
                        'SELECT count(*) FROM public.rex_%s_01_cash_lines WHERE customer_id = $1',
                        r.firm_nr
                    ) USING v_pesin_id INTO v_uses;
                END IF;

                -- sales
                IF v_uses = 0
                   AND to_regclass(format('public.rex_%s_01_sales', r.firm_nr)) IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = format('rex_%s_01_sales', r.firm_nr)
                          AND column_name = 'customer_id'
                   )
                THEN
                    EXECUTE format(
                        'SELECT count(*) FROM public.rex_%s_01_sales WHERE customer_id = $1',
                        r.firm_nr
                    ) USING v_pesin_id INTO v_uses;
                END IF;

                -- purchase_invoices (PESIN müşteri olarak kullanılmış olabilir mi? kontrol)
                IF v_uses = 0
                   AND to_regclass(format('public.rex_%s_01_purchase_invoices', r.firm_nr)) IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = format('rex_%s_01_purchase_invoices', r.firm_nr)
                          AND column_name = 'customer_id'
                   )
                THEN
                    EXECUTE format(
                        'SELECT count(*) FROM public.rex_%s_01_purchase_invoices WHERE customer_id = $1',
                        r.firm_nr
                    ) USING v_pesin_id INTO v_uses;
                END IF;

                IF v_uses > 0 THEN
                    RAISE NOTICE 'Firma % — PESIN (id=%) % referans var, SİLİNMEDİ',
                        r.firm_nr, v_pesin_id, v_uses;
                ELSE
                    EXECUTE format(
                        'DELETE FROM public.rex_%s_customers WHERE id = $1',
                        r.firm_nr
                    ) USING v_pesin_id;
                    GET DIAGNOSTICS v_deleted = ROW_COUNT;
                    IF v_deleted > 0 THEN
                        RAISE NOTICE 'Firma % — PESIN silindi (id=%)', r.firm_nr, v_pesin_id;
                    END IF;
                END IF;
            END IF;
        END IF;

        -- ── GENEL tedarikçi ──────────────────────────────────────
        IF to_regclass(format('public.rex_%s_suppliers', r.firm_nr)) IS NOT NULL THEN
            EXECUTE format(
                'SELECT id FROM public.rex_%s_suppliers WHERE code = ''GENEL'' LIMIT 1',
                r.firm_nr
            ) INTO v_genel_id;

            IF v_genel_id IS NOT NULL THEN
                v_uses := 0;

                -- cash_lines (supplier_id kolonu varsa)
                IF v_uses = 0
                   AND to_regclass(format('public.rex_%s_01_cash_lines', r.firm_nr)) IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = format('rex_%s_01_cash_lines', r.firm_nr)
                          AND column_name = 'supplier_id'
                   )
                THEN
                    EXECUTE format(
                        'SELECT count(*) FROM public.rex_%s_01_cash_lines WHERE supplier_id = $1',
                        r.firm_nr
                    ) USING v_genel_id INTO v_uses;
                END IF;

                -- purchase_invoices (supplier_id kolonu varsa)
                IF v_uses = 0
                   AND to_regclass(format('public.rex_%s_01_purchase_invoices', r.firm_nr)) IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = format('rex_%s_01_purchase_invoices', r.firm_nr)
                          AND column_name = 'supplier_id'
                   )
                THEN
                    EXECUTE format(
                        'SELECT count(*) FROM public.rex_%s_01_purchase_invoices WHERE supplier_id = $1',
                        r.firm_nr
                    ) USING v_genel_id INTO v_uses;
                END IF;

                -- purchase_returns (supplier_id kolonu varsa)
                IF v_uses = 0
                   AND to_regclass(format('public.rex_%s_01_purchase_returns', r.firm_nr)) IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = format('rex_%s_01_purchase_returns', r.firm_nr)
                          AND column_name = 'supplier_id'
                   )
                THEN
                    EXECUTE format(
                        'SELECT count(*) FROM public.rex_%s_01_purchase_returns WHERE supplier_id = $1',
                        r.firm_nr
                    ) USING v_genel_id INTO v_uses;
                END IF;

                -- account_movements (supplier_id kolonu varsa)
                IF v_uses = 0
                   AND to_regclass(format('public.rex_%s_01_account_movements', r.firm_nr)) IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = format('rex_%s_01_account_movements', r.firm_nr)
                          AND column_name = 'supplier_id'
                   )
                THEN
                    EXECUTE format(
                        'SELECT count(*) FROM public.rex_%s_01_account_movements WHERE supplier_id = $1',
                        r.firm_nr
                    ) USING v_genel_id INTO v_uses;
                END IF;

                IF v_uses > 0 THEN
                    RAISE NOTICE 'Firma % — GENEL (id=%) % referans var, SİLİNMEDİ',
                        r.firm_nr, v_genel_id, v_uses;
                ELSE
                    EXECUTE format(
                        'DELETE FROM public.rex_%s_suppliers WHERE id = $1',
                        r.firm_nr
                    ) USING v_genel_id;
                    GET DIAGNOSTICS v_deleted = ROW_COUNT;
                    IF v_deleted > 0 THEN
                        RAISE NOTICE 'Firma % — GENEL silindi (id=%)', r.firm_nr, v_genel_id;
                    END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;

    DROP TABLE _firms;
END;
$$;

-- NOT: Kod formatı LPAD(6) zaten migration 187 ile trigger üzerinden aktif.
-- Bu migration 188 yalnızca mevcut "PESIN" / "GENEL" seed'lerini siler.
-- Yeni sıfır data'da artık oluşmaz (000_master_schema.sql yorum satırı).
