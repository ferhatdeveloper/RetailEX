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
--   koşulunda **kısmi UNIQUE indeks** ile en fazla 1 aktif fiş.
--
--   Birden fazla giriş denemesinde PostgreSQL 23505 unique_violation
--   fırlatır; servis katmanı zaten ön-kontrol yapıyor ama bu katman
--   yarış durumlarına (paralel create) karşı son savunma.
--
-- Tedarikçi / cari / ledger dokunulmaz — yalnızca UNIQUE kısıt.
-- ============================================================================

-- schema_migrations idempotent (179 ile aynı desen)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SET search_path TO public;

-- ----------------------------------------------------------------------------
-- 1) public.stock_movement_items — kısmi UNIQUE indeks (product_id + aktif movement)
--    Aktif: movement.status <> 'cancelled' VE slip_kind='invoice' VE trcode=14
--    Uygulama: item üzerinden movement'e JOIN ile.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS stock_movement_items_opening_invoice_uidx
  ON public.stock_movement_items (product_id)
  WHERE EXISTS (
    SELECT 1 FROM public.stock_movements sm
     WHERE sm.id = stock_movement_items.movement_id
       AND sm.trcode = 14
       AND COALESCE(sm.slip_kind, 'quantity') = 'invoice'
       AND COALESCE(sm.status, '') <> 'cancelled'
  );

-- ----------------------------------------------------------------------------
-- 2) Tüm `rex_{firm}_{period}_stock_movement_items` firm/period tabloları için
--    idempotent CREATE UNIQUE INDEX (Tauri uyumlu — DO $$ içinde).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r_item RECORD;
  v_added INT := 0;
  v_skipped INT := 0;
BEGIN
  FOR r_item IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename ~ '^rex_[0-9]+_[0-9]+_stock_movement_items$'
  LOOP
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I
         ON public.%I (product_id)
        WHERE EXISTS (
          SELECT 1 FROM public.%I sm
           WHERE sm.id = %I.movement_id
             AND sm.trcode = 14
             AND COALESCE(sm.slip_kind, ''quantity'') = ''invoice''
             AND COALESCE(sm.status, '''') <> ''cancelled''
        )',
      r_item.tablename || '_opening_invoice_uidx',
      r_item.tablename,
      replace(r_item.tablename, '_stock_movement_items', '_stock_movements'),
      r_item.tablename
    );
    v_added := v_added + 1;
  END LOOP;
  RAISE NOTICE '[180] opening_invoice UNIQUE: % firma/dönem tablosuna uygulandı', v_added;
END $$;

-- ----------------------------------------------------------------------------
-- schema_migrations kaydı (idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('180_opening_invoice_unique_per_product.sql', NOW())
ON CONFLICT (filename) DO NOTHING;