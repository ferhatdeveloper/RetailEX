-- =========================================================================
-- 185 — PDKS / Aqua Beauty Excel Import şema hazırlığı
-- RetailEX · Aqua Beauty tenant (aqua_beauty DB) için personel/devam Excel
-- import'unun gerektirdiği kolonlar + departman + vardiya seed.
-- =========================================================================
-- Bu migration, `scripts/import-aqua-pdks-excel.mjs` scriptinin (HTML-disguised
-- .xls — 10 kişi × 30 gün, Eylül 2026) gerektirdiği şema parçalarını ekler:
--   • public.staff.excel_pdks_id    → Excel Person ID (1..8,10,11 — ID=9 yok)
--   • public.staff.source_period    → Bu kaydın Excel'den geldiği dönem (2026-09)
--   • public.staff_attendance.early_minutes  → Erken çıkış dakikası
--   • public.staff_attendance.excel_pdks_id  → Excel satır kimliği (PersonID*100+Day)
--   • public.staff_departments AQUA seed
--   • public.staff_shifts AQUA_NORMAL / AQUA_CUMA seed
-- Tüm ifadeler idempotent (ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- =========================================================================

SET search_path = public;

-- 1) PERSONEL — Excel import iz kolonları =================================
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS excel_pdks_id INT,
  ADD COLUMN IF NOT EXISTS source_period TEXT;

-- excel_pdks_id firm içinde benzersiz olmalı (UNIQUE üzerinden UPSERT için).
-- IF NOT EXISTS destekli DO block kullanmadan: ayrı ekle / yoksa constraint ekle.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'uq_staff_firm_excel_pdks_id'
       AND conrelid = 'public.staff'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE public.staff
             ADD CONSTRAINT uq_staff_firm_excel_pdks_id
             UNIQUE (firm_nr, excel_pdks_id)';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_staff_excel_pdks_id
  ON public.staff (firm_nr, excel_pdks_id)
  WHERE excel_pdks_id IS NOT NULL;

-- 2) DEVAM — erken çıkış + Excel satır kimliği ============================
ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS early_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS excel_pdks_id INT;

CREATE INDEX IF NOT EXISTS idx_staff_attendance_excel
  ON public.staff_attendance (firm_nr, period_nr, excel_pdks_id)
  WHERE excel_pdks_id IS NOT NULL;

-- 3) DEPARTMAN — Aqua Beauty ============================================
-- ON CONFLICT (firm_nr, code) DO NOTHING — 137 ile aynı UNIQUE kuralı.
INSERT INTO public.staff_departments (firm_nr, code, name, is_active)
SELECT '001', 'AQUA', 'Aqua Beauty', TRUE
 WHERE NOT EXISTS (
   SELECT 1 FROM public.staff_departments
    WHERE firm_nr = '001' AND code = 'AQUA'
 );

-- 4) VARDİYALAR — Aqua standart + cuma kısa ===============================
INSERT INTO public.staff_shifts
  (firm_nr, code, name, start_time, end_time, break_minutes, grace_minutes, work_days, is_active)
SELECT '001', 'AQUA_NORMAL',
       'Aqua Beauty Normal Mesai (09:00-18:00)',
       '09:00', '18:00', 60, 15, ARRAY[1,2,3,4,5,6]::SMALLINT[], TRUE
 WHERE NOT EXISTS (
   SELECT 1 FROM public.staff_shifts
    WHERE firm_nr = '001' AND code = 'AQUA_NORMAL'
 );

INSERT INTO public.staff_shifts
  (firm_nr, code, name, start_time, end_time, break_minutes, grace_minutes, work_days, is_active)
SELECT '001', 'AQUA_CUMA',
       'Aqua Beauty Cuma Kısa (09:00-13:00)',
       '09:00', '13:00', 0, 15, ARRAY[5]::SMALLINT[], TRUE
 WHERE NOT EXISTS (
   SELECT 1 FROM public.staff_shifts
    WHERE firm_nr = '001' AND code = 'AQUA_CUMA'
 );

-- 5) schema_migrations kaydı ==============================================
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('185_pdks_aqua_excel_import.sql', CURRENT_TIMESTAMP)
ON CONFLICT (filename) DO NOTHING;

-- 6) YORUM ================================================================
COMMENT ON COLUMN public.staff.excel_pdks_id IS
  'PDKS Excel import''tan gelen Person ID (1..8,10,11 — ID=9 atlanır). UNIQUE (firm_nr, excel_pdks_id) ile UPSERT anahtarı.';
COMMENT ON COLUMN public.staff.source_period IS
  'Bu kaydın hangi Excel döneminden geldiği (örn. 2026-09).';
COMMENT ON COLUMN public.staff_attendance.early_minutes IS
  'Planlanan çıkıştan kaç dakika erken çıktığı (erken çıkış = -X dakika).';
COMMENT ON COLUMN public.staff_attendance.excel_pdks_id IS
  'Excel satır kimliği = PersonID*100 + DayOfMonth (1..8,10,11 × 1..31).';