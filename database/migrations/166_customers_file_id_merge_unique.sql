-- ============================================================================
-- 166: customers — dosya no birleştirme + sayısal file_id tekilliği
-- ============================================================================
-- Amaç:
--   * rex_*_customers: merged_into_id / merged_at / merged_by / merge_notes
--   * Mükerrer sayısal file_id: en eski kayıt korunur; diğerlerine MAX+1…
--   * Aktif + birleştirilmemiş kartlarda sayısal file_id UNIQUE
-- Idempotent.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_sql text;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_customers$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS merged_into_id UUID', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS merged_by TEXT', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS merge_notes TEXT', r.tablename);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (merged_into_id) WHERE merged_into_id IS NOT NULL',
      r.tablename || '_merged_into_idx', r.tablename
    );

    -- Mükerrerleri ayır: rn>1 olanlara sıralı yeni numara
    v_sql := format($q$
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY NULLIF(BTRIM(file_id), '')::bigint
            ORDER BY created_at NULLS LAST, id
          ) AS rn
        FROM public.%I
        WHERE COALESCE(is_active, true) = true
          AND merged_into_id IS NULL
          AND NULLIF(BTRIM(COALESCE(file_id, '')), '') ~ '^[0-9]+$'
      ),
      need_fix AS (
        SELECT id, rn FROM ranked WHERE rn > 1
      ),
      base AS (
        SELECT COALESCE(
          MAX(CASE WHEN NULLIF(BTRIM(file_id), '') ~ '^[0-9]+$'
            THEN NULLIF(BTRIM(file_id), '')::bigint END), 0
        ) AS mx,
        COALESCE(
          MAX(CASE WHEN NULLIF(BTRIM(file_id), '') ~ '^[0-9]+$'
            THEN LENGTH(BTRIM(file_id)) END), 4
        ) AS pad
        FROM public.%I
      ),
      numbered AS (
        SELECT
          nf.id,
          LPAD(
            (b.mx + ROW_NUMBER() OVER (ORDER BY nf.rn, nf.id))::text,
            GREATEST(COALESCE(b.pad, 4), LENGTH((b.mx + ROW_NUMBER() OVER (ORDER BY nf.rn, nf.id))::text)),
            '0'
          ) AS new_fid
        FROM need_fix nf
        CROSS JOIN base b
      )
      UPDATE public.%I c
      SET file_id = n.new_fid, updated_at = NOW()
      FROM numbered n
      WHERE c.id = n.id
    $q$, r.tablename, r.tablename, r.tablename);
    EXECUTE v_sql;

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (
         (NULLIF(BTRIM(file_id), '''')::bigint)
       )
       WHERE COALESCE(is_active, true) = true
         AND merged_into_id IS NULL
         AND NULLIF(BTRIM(COALESCE(file_id, '''')), '''') ~ ''^[0-9]+$''',
      r.tablename || '_file_id_num_uniq', r.tablename
    );
  END LOOP;
END $$;
