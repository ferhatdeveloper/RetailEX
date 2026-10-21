-- Migration 213: PDKS yarım gün izin → tam gün çalışılmış gibi
-- Amaç: staff_leaves.total_days >= 0.5 olan izin günleri, aynı tarihte
--       staff_attendance kaydı yoksa PRESENT gibi değerlendirilir.
--       Yani: 0.5 gün izin alındığında gün tam çalışılmış gibi sayılır.
--
-- Etkilenen yerler:
--   1) public.staff_leaves.effective_day_count → GENERATED kolon (CEIL(total_days))
--   2) view public.v_staff_daily_effective    → attendance UNION leaves (>=0.5 gün → PRESENT)
--   3) function public.get_staff_monthly_attendance → leave_extra + effective_day_count
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE kullanıldı.

SET search_path TO public;

-- 1) staff_leaves.effective_day_count: yarım gün → 1 tam gün
ALTER TABLE public.staff_leaves
  ADD COLUMN IF NOT EXISTS effective_day_count NUMERIC(6,2)
  GENERATED ALWAYS AS (CEIL(total_days)) STORED;

-- 2) v_staff_daily_effective view: attendance + yarım gün izinler (>= 0.5 → PRESENT)
DROP VIEW IF EXISTS public.v_staff_daily_effective;
CREATE VIEW public.v_staff_daily_effective AS
SELECT a.staff_id, a.firm_nr, a.period_nr, a.attendance_date, a.staff_name,
       a.department, a.shift_id, a.status, a.worked_minutes, a.overtime_minutes,
       a.late_minutes, a.clock_in, a.clock_out,
       'ATTENDANCE'::text AS source
  FROM public.staff_attendance a
UNION ALL
-- Yarım gün veya tam gün izin alınan günler için sanal PRESENT kaydı
SELECT l.staff_id, l.firm_nr, l.period_nr, d::date AS attendance_date,
       COALESCE(st.full_name, l.staff_name) AS staff_name,
       COALESCE(st.department, '') AS department,
       NULL::uuid AS shift_id,
       'PRESENT'::text AS status,
       0 AS worked_minutes, 0 AS overtime_minutes,
       0 AS late_minutes,
       NULL::time AS clock_in, NULL::time AS clock_out,
       'LEAVE_HALF_OR_FULL'::text AS source
  FROM public.staff_leaves l
  CROSS JOIN LATERAL generate_series(l.start_date, l.end_date, '1 day'::interval) d
  LEFT JOIN public.staff st ON st.id = l.staff_id
 WHERE l.status = 'APPROVED'
   AND l.total_days >= 0.5
   AND NOT EXISTS (
     SELECT 1 FROM public.staff_attendance a2
      WHERE a2.firm_nr = l.firm_nr
        AND a2.period_nr = l.period_nr
        AND a2.staff_id  = l.staff_id
        AND a2.attendance_date = d::date
   );

-- 3) get_staff_monthly_attendance: yarım gün izinler tam gün sayılır
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
  -- yarım gün izin alınan ama attendance kaydı olmayan günler (sanal PRESENT)
  leave_extra AS (
    SELECT l.staff_id, COUNT(*)::int AS extra_days
      FROM public.staff_leaves l
      CROSS JOIN LATERAL generate_series(l.start_date, l.end_date, '1 day'::interval) d
     WHERE l.firm_nr = p_firm_nr
       AND l.status = 'APPROVED'
       AND l.total_days >= 0.5
       AND EXTRACT(YEAR FROM d::date) = p_year
       AND EXTRACT(MONTH FROM d::date) = p_month
       AND NOT EXISTS (
         SELECT 1 FROM public.staff_attendance a
          WHERE a.firm_nr = p_firm_nr AND a.period_nr = v_pn
            AND a.staff_id = l.staff_id AND a.attendance_date = d::date
       )
     GROUP BY l.staff_id
  ),
  -- toplam onaylı izin günleri (effective_day_count: 0.5 → 1, 1 → 1)
  lv AS (
    SELECT l.staff_id,
           COALESCE(SUM(l.effective_day_count), 0)::int AS leave_days
      FROM public.staff_leaves l
     WHERE l.firm_nr = p_firm_nr
       AND l.status = 'APPROVED'
       AND ((EXTRACT(YEAR FROM l.start_date) = p_year AND EXTRACT(MONTH FROM l.start_date) = p_month)
         OR (EXTRACT(YEAR FROM l.end_date) = p_year AND EXTRACT(MONTH FROM l.end_date) = p_month))
     GROUP BY l.staff_id
  )
  SELECT b.staff_id::uuid, b.staff_name::varchar, b.department::varchar, b.base_salary,
         (COALESCE(at.worked_days, 0) + COALESCE(le.extra_days, 0) + COALESCE(lv.leave_days, 0))::int AS total_days,
         COALESCE(at.worked_days, 0) + COALESCE(le.extra_days, 0),
         COALESCE(at.absent_days, 0),
         COALESCE(lv.leave_days, 0),
         COALESCE(at.late_days, 0),
         COALESCE(at.overtime_min, 0),
         0::numeric
    FROM base b
    LEFT JOIN att   at ON at.staff_id = b.staff_id
    LEFT JOIN leave_extra le ON le.staff_id = b.staff_id
    LEFT JOIN lv    lv ON lv.staff_id = b.staff_id;
END;
$$;

-- 4) schema_migrations kaydı
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES ('213_pdks_half_day_leave_is_full_day.sql', CURRENT_TIMESTAMP)
ON CONFLICT (filename) DO NOTHING;

COMMENT ON VIEW public.v_staff_daily_effective IS
'PDKS: staff_attendance + yarım gün izin (>=0.5) günleri sanal PRESENT. staff_leaves.total_days < 0.5 olan yarım günler HALF_DAY olarak değerlendirilir (attendance kaydı varsa o kullanılır).';
COMMENT ON COLUMN public.staff_leaves.effective_day_count IS
'Yarım gün izinleri tam güne yuvarlar (CEIL). 0.5 → 1, 1 → 1, 1.5 → 2.';
