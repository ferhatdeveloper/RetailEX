-- =========================================================================
-- 137 — PDKS / Personel Puantaj Tam Şema (Asin/EXFIN PDKS uyumlu)
-- RetailEX · VIVA SOLAR `personel` sayfası karşılığı
-- =========================================================================
-- Bu migration, ERP `getStaffAttendance` raporunun (StaffAttendanceReport.tsx)
-- ihtiyaç duyduğu tüm tabloları kurar:
--   • public.staff              → firma-bağımsız personel kartları
--   • public.staff_departments  → departmanlar (opsiyonel)
--   • public.staff_shifts       → vardiya tanımları
--   • public.staff_shift_assignments → vardiya atamaları (gün bazlı)
--   • rex_{f}_{p}_staff_attendance → günlük giriş/çıkış kayıtları (dönemsel)
--   • rex_{f}_{p}_staff_leaves  → izin kayıtları (dönemsel)
--   • rex_{f}_{p}_staff_payroll_periods → bordro kapanışları (dönemsel)
--   • helper view: v_staff_monthly_attendance
--
-- Tüm tablolar IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE
-- ile idempotent; birden fazla kez çalıştırılabilir.
-- =========================================================================

SET search_path = public, rex;

-- 1) DEPARTMANLAR ==========================================================
CREATE TABLE IF NOT EXISTS public.staff_departments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(8) NOT NULL,
  code         VARCHAR(40) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (firm_nr, code)
);

CREATE INDEX IF NOT EXISTS idx_staff_departments_firm
  ON public.staff_departments (firm_nr)
  WHERE is_active = TRUE;

-- 2) PERSONEL KARTLARI ====================================================
-- AsinERP/EXFIN PDKS'inde master personel kaydı burada tutulur.
-- Dönemsel hareketler (attendance / leaves / payroll) rex_{f}_{p}_ prefix
-- ile firm-period tablolarında durur (RetailEX mimari kuralı).
CREATE TABLE IF NOT EXISTS public.staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr         VARCHAR(8) NOT NULL,
  code            VARCHAR(40),
  full_name       VARCHAR(160) NOT NULL,
  tc_kimlik       VARCHAR(20),
  phone           VARCHAR(40),
  email           VARCHAR(160),
  address         TEXT,
  department_id   UUID REFERENCES public.staff_departments(id) ON DELETE SET NULL,
  department      VARCHAR(120),
  position        VARCHAR(120),
  hire_date       DATE,
  termination_date DATE,
  employment_type VARCHAR(20) DEFAULT 'full_time', -- full_time | part_time | contract | intern
  base_salary     NUMERIC(18,2) NOT NULL DEFAULT 0,  -- aylık brüt maaş
  hourly_rate     NUMERIC(18,4) NOT NULL DEFAULT 0,
  photo_url       TEXT,
  rfid_card       VARCHAR(80),
  pin_code        VARCHAR(10),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (firm_nr, code)
);

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS department      VARCHAR(120),
  ADD COLUMN IF NOT EXISTS position        VARCHAR(120),
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20) DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS base_salary     NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_rate     NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_url       TEXT,
  ADD COLUMN IF NOT EXISTS rfid_card       VARCHAR(80),
  ADD COLUMN IF NOT EXISTS pin_code        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS tc_kimlik       VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_staff_firm_active
  ON public.staff (firm_nr, is_active);
CREATE INDEX IF NOT EXISTS idx_staff_department
  ON public.staff (department_id)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_staff_name_trgm
  ON public.staff (firm_nr, full_name);

-- 3) VARDİYA TANIMLARI ===================================================
-- Pazartesi=1 … Pazar=7 ISO haftası
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(8) NOT NULL,
  code         VARCHAR(40) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  break_minutes SMALLINT NOT NULL DEFAULT 0,
  grace_minutes SMALLINT NOT NULL DEFAULT 15, -- geç kalma toleransı
  work_days    SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  color        VARCHAR(20),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (firm_nr, code)
);

ALTER TABLE public.staff_shifts
  ADD COLUMN IF NOT EXISTS color VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_firm
  ON public.staff_shifts (firm_nr)
  WHERE is_active = TRUE;

-- 4) VARDİYA ATAMALARI (master) ==========================================
CREATE TABLE IF NOT EXISTS public.staff_shift_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr      VARCHAR(8) NOT NULL,
  staff_id     UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  shift_id     UUID NOT NULL REFERENCES public.staff_shifts(id) ON DELETE RESTRICT,
  valid_from   DATE NOT NULL,
  valid_to     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_staff_shift_assign
  ON public.staff_shift_assignments (firm_nr, staff_id, valid_from);

-- 5) DÖNEMSEL TABLOLAR İÇİN YARDIMCI FONKSİYON ===========================
-- get_firm_prefix(): 'firmaNo' → '001' gibi normalize eder (rex_{001}_...)
CREATE OR REPLACE FUNCTION public.get_firm_prefix(p_firm_nr TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT;
BEGIN
  v := regexp_replace(COALESCE(p_firm_nr, ''), '[^0-9]', '', 'g');
  IF v IS NULL OR v = '' THEN
    RETURN '001';
  END IF;
  -- 4 haneye kadar destekle, fazlasını kırp
  RETURN LPAD(LEFT(v, 4), 3, '0');
END;
$$;

-- get_period_prefix(): '12' → '12' (2 haneye sabitle)
CREATE OR REPLACE FUNCTION public.get_period_prefix(p_period TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT;
BEGIN
  v := LPAD(regexp_replace(COALESCE(p_period, '01'), '[^0-9]', '', 'g'), 2, '0');
  RETURN LEFT(v, 2);
END;
$$;

-- 6) DÖNEMSEL PDKS TABLOLARI =============================================
-- RetailEX'in genel kuralı dönemsel tabloları `rex` şemasında tutmaktır; ancak
-- bazı tenant DB'lerde (örn. `aqua_beauty`) `rex` şeması kurulmamış olabilir.
-- Bu migration `public` şemasında dönemsel tablolar kurar (firm_nr+period_nr
-- kolonlarıyla zaten logical isolation sağlanıyor); ileride rex şemasına
-- taşıma için view/migration eklenebilir.
--
-- Yapılan: `staff_attendance` / `staff_leaves` / `staff_payroll_periods`
-- tek tablo, `firm_nr` ve `period_nr` kolonlarıyla tenant-scoped.

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr            VARCHAR(8) NOT NULL,
  period_nr          VARCHAR(2) NOT NULL,
  staff_id           UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_name         VARCHAR(160) NOT NULL,
  department         VARCHAR(120),
  attendance_date    DATE NOT NULL,
  shift_id           UUID REFERENCES public.staff_shifts(id) ON DELETE SET NULL,
  scheduled_start    TIME,
  scheduled_end      TIME,
  clock_in           TIME,
  clock_out          TIME,
  worked_minutes     INTEGER NOT NULL DEFAULT 0,
  break_minutes      INTEGER NOT NULL DEFAULT 0,
  overtime_minutes   INTEGER NOT NULL DEFAULT 0,
  late_minutes       INTEGER NOT NULL DEFAULT 0,
  status             VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
  -- PRESENT | ABSENT | LATE | HALF_DAY | LEAVE | HOLIDAY | OFF
  source             VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- manual | rfid | fingerprint | mobile | web
  device_id          VARCHAR(80),
  notes              TEXT,
  recorded_by        UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (firm_nr, period_nr, staff_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date
  ON public.staff_attendance (firm_nr, attendance_date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff
  ON public.staff_attendance (firm_nr, staff_id, attendance_date);

CREATE TABLE IF NOT EXISTS public.staff_leaves (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr        VARCHAR(8) NOT NULL,
  period_nr      VARCHAR(2) NOT NULL,
  staff_id       UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_name     VARCHAR(160) NOT NULL,
  leave_type     VARCHAR(30) NOT NULL DEFAULT 'ANNUAL',
  -- ANNUAL | SICK | UNPAID | MATERNITY | PATERNITY | BEREAVEMENT | OTHER
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  total_days     NUMERIC(6,2) NOT NULL DEFAULT 0,
  paid           BOOLEAN NOT NULL DEFAULT TRUE,
  status         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING | APPROVED | REJECTED | CANCELLED
  approved_by    UUID,
  approved_at    TIMESTAMPTZ,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_leaves_staff
  ON public.staff_leaves (firm_nr, staff_id, start_date);

CREATE TABLE IF NOT EXISTS public.staff_payroll_periods (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr             VARCHAR(8) NOT NULL,
  period_nr           VARCHAR(2) NOT NULL,
  period_year         SMALLINT NOT NULL,
  period_month        SMALLINT NOT NULL,
  closed_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_by           UUID,
  total_worked_days   INTEGER NOT NULL DEFAULT 0,
  total_absent_days   INTEGER NOT NULL DEFAULT 0,
  total_leave_days    INTEGER NOT NULL DEFAULT 0,
  total_gross_salary  NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  UNIQUE (firm_nr, period_year, period_month)
);

-- 7) AYIN HIZLI ÖZETİ İÇİN VIEW ========================================
-- Public şemada staff_attendance + staff_leaves'ten firm/period filtreli özet.
-- StaffAttendanceReport.tsx için yardımcı aggregate fonksiyon.
CREATE OR REPLACE FUNCTION public.get_staff_monthly_attendance(
  p_firm_nr      TEXT,
  p_period_nr    TEXT,
  p_year         INT,
  p_month        INT,
  p_staff_ids    UUID[] DEFAULT NULL,
  p_department   TEXT DEFAULT NULL
)
RETURNS TABLE (
  staff_id        UUID,
  staff_name      VARCHAR,
  department      VARCHAR,
  base_salary     NUMERIC,
  total_days      INT,
  worked_days     INT,
  absent_days     INT,
  leave_days      INT,
  late_days       INT,
  overtime_min    INT,
  extra_payment   NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pn TEXT;
BEGIN
  v_pn := public.get_period_prefix(p_period_nr);

  RETURN QUERY
  WITH base AS (
    SELECT s.id AS staff_id, s.full_name AS staff_name,
           COALESCE(s.department, d.name, '') AS department,
           COALESCE(s.base_salary, 0) AS base_salary
      FROM public.staff s
      LEFT JOIN public.staff_departments d ON d.id = s.department_id
     WHERE s.firm_nr = p_firm_nr
       AND s.is_active = TRUE
       AND (p_staff_ids IS NULL OR s.id = ANY(p_staff_ids))
       AND (p_department IS NULL OR COALESCE(s.department, d.name, '') = p_department)
  ),
  att AS (
    SELECT a.staff_id,
           COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int +
           COUNT(*) FILTER (WHERE a.status = 'LATE')::int +
           COUNT(*) FILTER (WHERE a.status = 'HALF_DAY')::int AS worked_days,
           COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent_days,
           COUNT(*) FILTER (WHERE a.status = 'LATE')::int AS late_days,
           COALESCE(SUM(a.overtime_minutes), 0)::int AS overtime_min
      FROM public.staff_attendance a
     WHERE a.firm_nr = p_firm_nr
       AND a.period_nr = v_pn
       AND EXTRACT(YEAR FROM a.attendance_date) = p_year
       AND EXTRACT(MONTH FROM a.attendance_date) = p_month
     GROUP BY a.staff_id
  ),
  lv AS (
    SELECT l.staff_id,
           SUM(l.total_days)::int AS leave_days
      FROM public.staff_leaves l
     WHERE l.firm_nr = p_firm_nr
       AND l.status IN ('APPROVED')
       AND ((EXTRACT(YEAR FROM l.start_date) = p_year AND EXTRACT(MONTH FROM l.start_date) = p_month)
         OR (EXTRACT(YEAR FROM l.end_date) = p_year AND EXTRACT(MONTH FROM l.end_date) = p_month))
     GROUP BY l.staff_id
  )
  SELECT b.staff_id::uuid, b.staff_name::varchar, b.department::varchar, b.base_salary,
         (COALESCE(at.worked_days, 0) + COALESCE(lv.leave_days, 0))::int AS total_days,
         COALESCE(at.worked_days, 0),
         COALESCE(at.absent_days, 0),
         COALESCE(lv.leave_days, 0),
         COALESCE(at.late_days, 0),
         COALESCE(at.overtime_min, 0),
         0::numeric
    FROM base b
    LEFT JOIN att at ON at.staff_id = b.staff_id
    LEFT JOIN lv  lv ON lv.staff_id = b.staff_id;
END;
$$;

-- 8) updated_at TRIGGER ===================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_touch ON public.staff;
CREATE TRIGGER trg_staff_touch
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_staff_dept_touch ON public.staff_departments;
CREATE TRIGGER trg_staff_dept_touch
  BEFORE UPDATE ON public.staff_departments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 9) schema_migrations KAYDI =============================================
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('137_pdks_attendance_full.sql', CURRENT_TIMESTAMP)
ON CONFLICT (filename) DO NOTHING;

-- 10) YORUM ===============================================================
COMMENT ON TABLE public.staff IS
  'PDKS ana personel tablosu. Dönemsel hareketler rex_{firm}_{period}_staff_attendance / leaves / payroll_periods tablolarında.';
COMMENT ON FUNCTION public.get_staff_monthly_attendance IS
  'StaffAttendanceReport.tsx için aylık özet döner: worked_days, absent_days, leave_days, late_days, overtime.';