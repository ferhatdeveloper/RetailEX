-- Özbek restoran kiracısı — kat ve masa başlangıç verisi (firma 001)
-- provision-ozbek-restaurant.sh sonrası uygulanır.

INSERT INTO rest.floors (store_id, name, color, display_order)
SELECT s.id, 'Salon', '#F97316', 1
FROM stores s
WHERE s.firm_nr = '001'
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO rest.floors (store_id, name, color, display_order)
SELECT s.id, 'Teras', '#10B981', 2
FROM stores s
WHERE s.firm_nr = '001'
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO rest.rex_001_rest_tables (floor_id, number, seats, status, pos_x, pos_y)
SELECT f.id, v.number::VARCHAR, v.seats, 'empty', v.px, v.py
FROM rest.floors f,
(VALUES
  ('1', 4, 60, 60),
  ('2', 4, 180, 60),
  ('3', 2, 300, 60),
  ('4', 4, 60, 180),
  ('5', 6, 180, 180),
  ('6', 4, 300, 180),
  ('7', 8, 420, 120)
) AS v(number, seats, px, py)
WHERE f.name = 'Salon'
  AND NOT EXISTS (
    SELECT 1 FROM rest.rex_001_rest_tables t WHERE t.number = v.number::VARCHAR
  );

UPDATE public.firms
SET name = 'Özbek Restoran', is_active = true, "default" = true
WHERE firm_nr = '001';

NOTIFY pgrst, 'reload schema';
