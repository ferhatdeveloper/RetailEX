-- ============================================================================
-- 178 — Eksik kolonlar idempotent catchup
-- Tarih       : 2026-09-29
-- Tetikleyen  : verify-missing-columns.mjs raporu — 14 kiracıda 34 eksik kolon
--               (ağırlıklı rest.rex_*_*_rest_kitchen_items.job_type, PDKS
--               public.staff kolonları, public.staff_shifts.color).
--
-- Kapsam:
--   1) rest.rex_*_*_rest_kitchen_items.job_type  (firm-prefixed)
--   2) public.staff kolonları: department, position, employment_type,
--      base_salary, hourly_rate, photo_url, rfid_card, pin_code, tc_kimlik
--   3) public.staff_shifts.color
--
-- Tüm ALTER'lar IF NOT EXISTS / DO $$ ile idempotent.
-- ============================================================================

-- schema_migrations henüz yoksa idempotent oluştur
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SET search_path TO public, rest;

-- 1) rest.rex_*_*_rest_kitchen_items.job_type ------------------------------
-- Master migration 109 / 124 bu kolonu ALTER ile ekliyor; ancak tetikleyici
-- tablo o sırada var olmalı ve runner başarılı tamamlanmalı. Bazı kiracılarda
-- tablo var ama kolon eklenemedi (runner başarısız / eski sürüm).
-- Burada tüm rex_*_*_rest_kitchen_items tabloları için kolonu idempotent
-- ekliyoruz.
DO $$
DECLARE
  r RECORD;
  v_added INT := 0;
  v_skipped INT := 0;
BEGIN
  FOR r IN
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'rest'
       AND tablename ~ '^rex_[0-9]+_[0-9]+_rest_kitchen_items$'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'rest'
         AND table_name = r.tablename
         AND column_name = 'job_type'
    ) THEN
      EXECUTE format(
        'ALTER TABLE rest.%I ADD COLUMN IF NOT EXISTS job_type VARCHAR(40) NOT NULL DEFAULT %L',
        r.tablename,
        'kitchen_ticket'
      );
      v_added := v_added + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '[178] rest_kitchen_items.job_type: % eklendi, % zaten vardı', v_added, v_skipped;
END $$;

-- 2) public.staff kolonları ------------------------------------------------
-- 137_pdks_attendance_full.sql bunları ADD COLUMN IF NOT EXISTS ile kurar;
-- ancak tablo yoksa CREATE TABLE IF NOT EXISTS yapar ve tüm kolonlar gelir.
-- Burada yalnızca tablo varsa ve kolon eksikse ekle (geriye dönük fix).
DO $$
BEGIN
  IF to_regclass('public.staff') IS NOT NULL THEN
    ALTER TABLE public.staff
      ADD COLUMN IF NOT EXISTS department      VARCHAR(120),
      ADD COLUMN IF NOT EXISTS position        VARCHAR(120),
      ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20)  DEFAULT 'full_time',
      ADD COLUMN IF NOT EXISTS base_salary     NUMERIC(18,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hourly_rate     NUMERIC(18,4) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS photo_url       TEXT,
      ADD COLUMN IF NOT EXISTS rfid_card       VARCHAR(80),
      ADD COLUMN IF NOT EXISTS pin_code        VARCHAR(10),
      ADD COLUMN IF NOT EXISTS tc_kimlik       VARCHAR(20);
  END IF;
END $$;

-- 3) public.staff_shifts.color --------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.staff_shifts') IS NOT NULL THEN
    ALTER TABLE public.staff_shifts
      ADD COLUMN IF NOT EXISTS color VARCHAR(20);
  END IF;
END $$;

-- schema_migrations kaydı (idempotent)
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('178_missing_columns_idempotent_catchup.sql', NOW())
ON CONFLICT (filename) DO NOTHING;
