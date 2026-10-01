-- ============================================================================
-- Migration 185: LPAD(6) — tüm rex_*.code numerik alanları 6 haneye tamamla
-- ----------------------------------------------------------------------------
-- Amaç:
--   Yeni trigger (000_master_schema.sql → lpad_retail_code) yalnızca INSERT/
--   UPDATE'de çalışır. Mevcut veriler için tek seferlik backfill.
--
--   Tüm `rex_<firmNr>_*` tablolarında (public/beauty/wms/rest/logic):
--   - `code` kolonu varsa
--   - sadece rakamlardan oluşuyorsa
--   - uzunluğu <= 6 ise
--     → lpad(code::text, 6, '0') ile 6 haneye tamamla.
--
-- Uygulama:
--   PGPASSWORD='...' psql -h HOST -U postgres -d DBNAME -f \
--     database/migrations/185_lpad_retail_codes.sql
-- ============================================================================

DO $$
DECLARE
    r RECORD;
    v_updated INTEGER := 0;
BEGIN
    FOR r IN
        SELECT n.nspname AS sch, c.relname AS tbl
          FROM pg_class c
          JOIN pg_namespace n ON c.relnamespace = n.oid
         WHERE c.relkind = 'r'
           AND n.nspname IN ('public','beauty','wms','rest','logic')
           AND c.relname ~ '^rex_[0-9]+_'
           AND EXISTS (
               SELECT 1 FROM pg_attribute
                WHERE attrelid = c.oid
                  AND attname = 'code'
                  AND NOT attisdropped
           )
    LOOP
        EXECUTE format(
            'UPDATE %I.%I
                SET code = lpad(code::text, 6, ''0'')
              WHERE code IS NOT NULL
                AND code <> ''''
                AND code ~ ''^[0-9]+$''
                AND length(code::text) <= 6',
            r.sch, r.tbl
        );
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated > 0 THEN
            RAISE NOTICE '%  -> % rows updated', r.tbl, v_updated;
        END IF;
    END LOOP;
END;
$$;

-- Trigger fonksiyonu ve tetikleyiciler 000_master_schema.sql ile gelir;
-- yalnız master'ı kullanmayan eski DB'ler için burada tekrar kur:
CREATE OR REPLACE FUNCTION public.lpad_retail_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_numeric BOOLEAN;
    v_cur_len    INTEGER;
BEGIN
    IF NEW.code IS NOT NULL AND NEW.code <> '' THEN
        v_cur_len := length(NEW.code::text);
        IF v_cur_len <= 6 AND NEW.code ~ '^[0-9]+$' THEN
            NEW.code := lpad(NEW.code::text, 6, '0');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT n.nspname AS sch, c.relname AS tbl
          FROM pg_class c
          JOIN pg_namespace n ON c.relnamespace = n.oid
         WHERE c.relkind = 'r'
           AND n.nspname IN ('public','beauty','wms','rest','logic')
           AND c.relname ~ '^rex_[0-9]+_'
           AND EXISTS (
               SELECT 1 FROM pg_attribute
                WHERE attrelid = c.oid
                  AND attname = 'code'
                  AND NOT attisdropped
           )
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_lpad_code ON %I.%I;
             CREATE TRIGGER trg_lpad_code
                 BEFORE INSERT OR UPDATE OF code ON %I.%I
                 FOR EACH ROW
                 EXECUTE FUNCTION public.lpad_retail_code();',
            r.sch, r.tbl, r.sch, r.tbl
        );
    END LOOP;
END;
$$;
