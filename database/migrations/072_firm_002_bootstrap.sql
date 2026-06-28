-- Firma 002: kurulum, dönem 01, BAGHDAD mağazası ve rex_002_* tabloları

INSERT INTO firms (id, firm_nr, name, "default", ana_para_birimi, raporlama_para_birimi)
VALUES ('00000000-0000-4000-a000-000000000002', '002', 'Firma 002', false, 'IQD', 'IQD')
ON CONFLICT (firm_nr) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true;

INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active, "default")
SELECT f.id, 1, '2026-01-01'::date, '2026-12-31'::date, true, true
FROM firms f
WHERE f.firm_nr = '002'
ON CONFLICT (firm_id, nr) DO UPDATE SET
  is_active = true,
  beg_date = EXCLUDED.beg_date,
  end_date = EXCLUDED.end_date;

INSERT INTO stores (id, code, name, firm_nr, type, region, city, is_main, is_active, "default")
VALUES (
  '00000000-0000-4000-b000-000000000002',
  'BAGHDAD',
  'Baghdad Store',
  '002',
  'BRANCH',
  'Baghdad',
  'Baghdad',
  true,
  true,
  true
)
ON CONFLICT (code) DO UPDATE SET
  firm_nr = EXCLUDED.firm_nr,
  name = EXCLUDED.name,
  region = EXCLUDED.region,
  city = EXCLUDED.city,
  is_active = true;

SELECT public.CREATE_FIRM_TABLES('002');
SELECT public.CREATE_PERIOD_TABLES('002', '01');
SELECT public.INIT_RESTAURANT_FIRM_TABLES('002');
SELECT public.INIT_BEAUTY_FIRM_TABLES('002');
SELECT public.INIT_RESTAURANT_PERIOD_TABLES('002', '01');
SELECT public.INIT_BEAUTY_PERIOD_TABLES('002', '01');

NOTIFY pgrst, 'reload schema';
