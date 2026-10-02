-- ============================================================================
-- Migration 190: Fatura Back-Dated Audit (is_back_dated + insertion_at)
-- ----------------------------------------------------------------------------
-- Amaç:
--   Kullanıcı talebi: "Faturalarda tarihi geçmiş tarihe ekleyebilmemiz gerekiyor
--   ama ekleme tarihi belli olmalı."
--
--   Mevcut durum:
--     - `sales.date` işlem (belge) tarihini taşır. Tarih geçmişe çekilebilir.
--     - `sales.created_at` ekleme anına yakındır (default CURRENT_TIMESTAMP).
--     - Ancak audit için **resmi** "ekleme tarihi" kolonu yoktu ve
--     "geçmiş tarihli mi?" sorusu net cevaplanamıyordu.
--
--   Bu migration şunları ekler:
--     * `is_back_dated BOOLEAN`  → `sales.date < insertion_at` ise true
--     * `insertion_at TIMESTAMPTZ`  → kayıt anı (INSERT'te set edilir; UPDATE'te
--                       ASLA değişmemelidir)
--     * `back_dated_at TIMESTAMPTZ` → back-dated ise INSERT anında set edilir;
--                       sonra readonly
--     * `back_dated_by_user_id UUID` → back-dated kaydı onaylayan kullanıcı
--
--   KDV dönemi + vergi denetimi için kritik:
--     - Geçmişe dönük kayıtların tespiti
--     - Muhasebe denetimi
--
--   Pattern kaynak: 186_cash_lines_back_dated.sql (kasa).
--
-- Idempotent:
--   DO $$ + ADD COLUMN IF NOT EXISTS ile birden fazla kez çalıştırılabilir.
--   DDL ayrı ALTER ifadelerine bölünmüştür (Tauri DO $$ uyumu).
-- ============================================================================

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_sales$'
  LOOP
    -- 1) is_back_dated
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_back_dated BOOLEAN NOT NULL DEFAULT false',
      v_rec.tablename
    );

    -- 2) insertion_at — INSERT'te default NOW(); geriye dönük = gerçek ekleme anı
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS insertion_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP',
      v_rec.tablename
    );

    -- 3) back_dated_at — yalnızca INSERT'te set edilir (audit)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS back_dated_at TIMESTAMPTZ',
      v_rec.tablename
    );

    -- 4) back_dated_by_user_id — yalnızca INSERT'te set edilir
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS back_dated_by_user_id UUID',
      v_rec.tablename
    );

    -- 5) created_at default zaten var ama yoksa garanti et
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN insertion_at SET DEFAULT CURRENT_TIMESTAMP',
      v_rec.tablename
    );

    -- 6) Raporlama / denetim indeksleri (idempotent)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (insertion_at DESC)',
      v_rec.tablename || '_insertion_at_idx',
      v_rec.tablename
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (is_back_dated) WHERE is_back_dated = true',
      v_rec.tablename || '_backdated_idx',
      v_rec.tablename
    );
  END LOOP;
END
$$;

-- 000_master_schema.sql CREATE_PERIOD_TABLES içindeki `_sales` CREATE ifadesinde
-- de bu kolonlar tanımlıdır (yeni firma/dönem açılışlarında otomatik gelir).
--
-- UPDATE'te `insertion_at` ASLA değişmemelidir. Bunu zorlamak amacıyla
-- bilgi şemasından var olan trigger'ları kontrol edip mevcut ise bırakırız;
-- aksi halde uygulama katmanı (src/services/api/invoices.ts) UPDATE'te
-- `insertion_at` / `back_dated_at` / `back_dated_by_user_id` alanlarını
-- payload'a dahil etmeyerek doğal koruma sağlar.