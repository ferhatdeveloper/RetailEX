-- ============================================================================
-- 180 — Açılış faturası (slip_kind='invoice') UNIQUE ürün başına
-- Tarih       : 2026-09-29
-- Tetikleyen  : Malzeme Açılış Faturası modülü — aynı ürün için birden
--               fazla açılış faturası girilmesini DB seviyesinde engelle.
--
-- Kök neden:
--   179 ile gelen `slip_kind='invoice'` semantiği "absolute replace" —
--   yeni miktar = ürünün gerçek açılış miktarı. Aynı ürün için ikinci
--   bir fiş girilirse:
--     - Stok şişer (delta ekleme değil absolute, ama absolute'de de
--       ikinci fiş birincisinin üstüne yazıyor — stok tutarsız olur).
--     - Maliyet sürekli overwrite olur, geriye dönük audit imkansızlaşır.
--   Bu yüzden: aynı (firm_nr, period_nr, product_id) üçlüsü için
--   slip_kind='invoice' AND trcode=14 AND status <> 'cancelled'
--   koşulunda **DB trigger** ile "en fazla 1 aktif fiş" garantisi.
--
-- Neden UNIQUE INDEX değil?
--   `product_id` item tablosunda; `trcode/slip_kind/status` ise movements
--   tablosunda. PostgreSQL indeks predicate'leri yalnızca aynı tablonun
--   kolonlarına başvurabilir; cross-table WHERE kullanılamaz. Bu yüzden
--   DB seviyesi garanti için BEFORE INSERT/UPDATE trigger kullanıyoruz.
--
-- Tedarikçi / cari / ledger dokunulmaz — yalnızca trigger.
-- ============================================================================

-- schema_migrations idempotent (179 ile aynı desen)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SET search_path TO public;

-- ----------------------------------------------------------------------------
-- 1) Global public.stock_movement_items + public.stock_movements için trigger
--    (eski şema; yeni kurulumlarda kullanılmıyor)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.stock_movement_items') IS NOT NULL
     AND to_regclass('public.stock_movements') IS NOT NULL THEN
    EXECUTE $tg$
      CREATE OR REPLACE FUNCTION public.stock_movement_items_opening_invoice_guard()
      RETURNS TRIGGER AS $fn$
      DECLARE
        v_trcode     INT;
        v_slip_kind  VARCHAR(20);
        v_status     VARCHAR(20);
      BEGIN
        SELECT sm.trcode, sm.slip_kind, sm.status
          INTO v_trcode, v_slip_kind, v_status
          FROM public.stock_movements sm
         WHERE sm.id = NEW.movement_id;
        IF v_trcode = 14
           AND COALESCE(v_slip_kind, 'quantity') = 'invoice'
           AND COALESCE(v_status, '') <> 'cancelled' THEN
          IF EXISTS (
            SELECT 1
              FROM public.stock_movement_items si
              JOIN public.stock_movements sm2 ON sm2.id = si.movement_id
             WHERE si.product_id = NEW.product_id
               AND si.movement_id <> NEW.movement_id
               AND sm2.trcode = 14
               AND COALESCE(sm2.slip_kind, 'quantity') = 'invoice'
               AND COALESCE(sm2.status, '') <> 'cancelled'
          ) THEN
            RAISE EXCEPTION 'Bu ürün için zaten aktif bir açılış faturası var'
              USING ERRCODE = '23505';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql;
    $tg$;

    EXECUTE 'DROP TRIGGER IF EXISTS stock_movement_items_opening_invoice_guard_trg
               ON public.stock_movement_items';
    EXECUTE 'CREATE TRIGGER stock_movement_items_opening_invoice_guard_trg
               BEFORE INSERT OR UPDATE OF movement_id, product_id
               ON public.stock_movement_items
               FOR EACH ROW
               EXECUTE FUNCTION public.stock_movement_items_opening_invoice_guard()';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Tüm `rex_{firm}_{period}_stock_movement_items` firm/period tabloları için
--    idempotent trigger fonksiyonu + trigger kurulumu.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r_item     RECORD;
  r_mov      RECORD;
  v_items    INT := 0;
  v_added    INT := 0;
  v_skipped  INT := 0;
  v_funcname TEXT;
  v_trgname  TEXT;
  v_movtbl   TEXT;
BEGIN
  FOR r_item IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename ~ '^rex_[0-9]+_[0-9]+_stock_movement_items$'
  LOOP
    v_items := v_items + 1;
    v_movtbl := replace(r_item.tablename, '_stock_movement_items', '_stock_movements');

    -- Movements tablosu yoksa bu item tablosunu atla (yarım kalan DB).
    IF to_regclass('public.' || v_movtbl) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_funcname := r_item.tablename || '_opening_invoice_guard_fn';
    v_trgname  := r_item.tablename || '_opening_invoice_guard_trg';

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I() RETURNS TRIGGER AS $fn$
       DECLARE
         v_trcode    INT;
         v_slip_kind VARCHAR(20);
         v_status    VARCHAR(20);
       BEGIN
         SELECT sm.trcode, sm.slip_kind, sm.status
           INTO v_trcode, v_slip_kind, v_status
           FROM public.%I sm
          WHERE sm.id = NEW.movement_id;
         IF v_trcode = 14
            AND COALESCE(v_slip_kind, ''quantity'') = ''invoice''
            AND COALESCE(v_status, '''') <> ''cancelled'' THEN
           IF EXISTS (
             SELECT 1
               FROM public.%I si
               JOIN public.%I sm2 ON sm2.id = si.movement_id
              WHERE si.product_id = NEW.product_id
                AND si.movement_id <> NEW.movement_id
                AND sm2.trcode = 14
                AND COALESCE(sm2.slip_kind, ''quantity'') = ''invoice''
                AND COALESCE(sm2.status, '''') <> ''cancelled''
           ) THEN
             RAISE EXCEPTION ''Bu ürün için zaten aktif bir açılış faturası var''
               USING ERRCODE = ''23505'';
           END IF;
         END IF;
         RETURN NEW;
       END;
       $fn$ LANGUAGE plpgsql',
      v_funcname,
      v_movtbl,
      r_item.tablename,
      v_movtbl
    );

    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I',
      v_trgname, r_item.tablename
    );
    EXECUTE format(
      'CREATE TRIGGER %I
         BEFORE INSERT OR UPDATE OF movement_id, product_id
         ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.%I()',
      v_trgname, r_item.tablename, v_funcname
    );

    v_added := v_added + 1;
  END LOOP;

  RAISE NOTICE '[180] opening_invoice guard trigger: % firma/dönem tablosuna uygulandı (atlanan: %)', v_added, v_skipped;
END $$;

-- ----------------------------------------------------------------------------
-- schema_migrations kaydı (idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('180_opening_invoice_unique_per_product.sql', NOW())
ON CONFLICT (filename) DO NOTHING;
